#!/usr/bin/env bash
# 将安装包同步到 Gitee Release（国内下载更快）
# 用法: GITEE_TOKEN=xxx ./scripts/publish-gitee-release.sh <owner> <repo> <tag> <github_repo> <file...>
# 说明: Gitee 附件上限约 100MB；超限文件不上传，改为在 Release 说明里给 GitHub/镜像链接
set -euo pipefail

OWNER="${1:?owner}"
REPO="${2:?repo}"
TAG="${3:?tag}"
GITHUB_REPO="${4:?github_repo}"
shift 4

if [[ $# -lt 1 ]]; then
  echo "未提供要上传的文件" >&2
  exit 1
fi

if [[ -z "${GITEE_TOKEN:-}" ]]; then
  echo "缺少 GITEE_TOKEN" >&2
  exit 1
fi

API="https://gitee.com/api/v5"
# 略低于 100MB，避免边界失败
MAX_BYTES=$((95 * 1024 * 1024))

echo "==> 查找/创建 Gitee Release: ${OWNER}/${REPO} ${TAG}"

RELEASE_JSON="$(curl -sS -G "${API}/repos/${OWNER}/${REPO}/releases/tags/${TAG}" \
  --data-urlencode "access_token=${GITEE_TOKEN}" || true)"

RELEASE_ID="$(node -e 'const j=JSON.parse(process.argv[1]||"{}"); if(!j.id) process.exit(2); process.stdout.write(String(j.id))' "${RELEASE_JSON}" 2>/dev/null || true)"

build_body() {
  local lines=()
  lines+=("MPT ${TAG} 桌面安装包")
  lines+=("")
  lines+=("## 如何选择文件")
  lines+=("- **Mac（Apple Silicon）**：\`MPT-*-mac-arm64.dmg\`（推荐）或 \`.zip\`")
  lines+=("- **Windows**：\`MPT-*-win-x64.exe\`")
  lines+=("- **Linux**：\`MPT-*-linux-*.AppImage\` / \`.deb\`")
  lines+=("")
  lines+=("## 下载（推荐）")
  lines+=("Gitee 附件上限约 100MB，完整安装包请从 GitHub Release 或镜像下载：")
  lines+=("")
  lines+=("- GitHub：https://github.com/${GITHUB_REPO}/releases/tag/${TAG}")
  lines+=("- 镜像示例：\`https://ghfast.top/https://github.com/${GITHUB_REPO}/releases/download/${TAG}/文件名\`")
  lines+=("")
  lines+=("本页仅保留体积较小的附件（如有）。")
  printf '%s\n' "${lines[@]}"
}

BODY="$(build_body)"

if [[ -z "${RELEASE_ID}" ]]; then
  echo "==> Release 不存在，正在创建…"
  RELEASE_JSON="$(curl -sS -X POST "${API}/repos/${OWNER}/${REPO}/releases" \
    --data-urlencode "access_token=${GITEE_TOKEN}" \
    --data-urlencode "tag_name=${TAG}" \
    --data-urlencode "name=MPT ${TAG}" \
    --data-urlencode "body=${BODY}" \
    --data-urlencode "target_commitish=main")"
  RELEASE_ID="$(node -e 'const j=JSON.parse(process.argv[1]); if(!j.id){console.error(process.argv[1]); process.exit(1)}; process.stdout.write(String(j.id))' "${RELEASE_JSON}")"
else
  echo "==> 更新 Release 说明…"
  curl -sS -X PATCH "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}" \
    --data-urlencode "access_token=${GITEE_TOKEN}" \
    --data-urlencode "body=${BODY}" \
    --data-urlencode "name=MPT ${TAG}" >/dev/null || true
fi

echo "==> Release id=${RELEASE_ID}"

EXISTING="$(curl -sS -G "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/attach_files" \
  --data-urlencode "access_token=${GITEE_TOKEN}" || echo '[]')"

# 清掉历史误传的工具文件
for junk in 7za.exe elevate.exe MPT.exe; do
  junk_id="$(node -e '
    const list=JSON.parse(process.argv[1]||"[]");
    const name=process.argv[2];
    const hit=list.find(x => x.name===name || x.file_name===name);
    if(hit) process.stdout.write(String(hit.id));
  ' "${EXISTING}" "${junk}" || true)"
  if [[ -n "${junk_id}" ]]; then
    echo "==> 删除误传附件 ${junk} (id=${junk_id})"
    curl -sS -X DELETE \
      "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/attach_files/${junk_id}?access_token=${GITEE_TOKEN}" \
      >/dev/null || true
  fi
done

# 刷新附件列表
EXISTING="$(curl -sS -G "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/attach_files" \
  --data-urlencode "access_token=${GITEE_TOKEN}" || echo '[]')"

upload_one() {
  local file="$1"
  local name
  name="$(basename "${file}")"
  local size
  size="$(wc -c <"${file}" | tr -d ' ')"

  if [[ "${size}" -gt "${MAX_BYTES}" ]]; then
    echo "==> 跳过 ${name} ($(( size / 1024 / 1024 )) MB) —— 超过 Gitee 100MB 限制，请用 GitHub/镜像下载"
    return 0
  fi

  echo "==> 上传 ${name} ($(( size / 1024 / 1024 )) MB)"

  local old_id
  old_id="$(node -e '
    const list=JSON.parse(process.argv[1]||"[]");
    const name=process.argv[2];
    const hit=list.find(x => x.name===name || x.file_name===name);
    if(hit) process.stdout.write(String(hit.id));
  ' "${EXISTING}" "${name}" || true)"
  if [[ -n "${old_id}" ]]; then
    echo "    删除旧附件 id=${old_id}"
    curl -sS -X DELETE \
      "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/attach_files/${old_id}?access_token=${GITEE_TOKEN}" \
      >/dev/null || true
  fi

  local resp http
  resp="$(mktemp)"
  http="$(curl -sS -o "${resp}" -w "%{http_code}" -X POST \
    "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/attach_files" \
    -F "access_token=${GITEE_TOKEN}" \
    -F "file=@${file};filename=${name}")"

  if [[ "${http}" != "201" && "${http}" != "200" ]]; then
    echo "    上传失败 HTTP ${http}: $(cat "${resp}")" >&2
    rm -f "${resp}"
    return 1
  fi
  echo "    成功"
  rm -f "${resp}"
  return 0
}

failed=0
for f in "$@"; do
  if [[ ! -f "${f}" ]]; then
    echo "跳过不存在文件: ${f}" >&2
    continue
  fi
  base="$(basename "${f}")"
  if [[ "${base}" != MPT-* ]]; then
    echo "跳过非安装包: ${base}"
    continue
  fi
  if ! upload_one "${f}"; then
    failed=1
  fi
done

echo "==> Gitee Release: https://gitee.com/${OWNER}/${REPO}/releases/${TAG}"
echo "==> GitHub Release: https://github.com/${GITHUB_REPO}/releases/tag/${TAG}"
exit "${failed}"
