#!/usr/bin/env bash
# 将安装包同步到 Gitee Release（国内下载更快）
# 用法: GITEE_TOKEN=xxx ./scripts/publish-gitee-release.sh <owner> <repo> <tag> <file...>
set -euo pipefail

OWNER="${1:?owner}"
REPO="${2:?repo}"
TAG="${3:?tag}"
shift 3

if [[ $# -lt 1 ]]; then
  echo "未提供要上传的文件" >&2
  exit 1
fi

if [[ -z "${GITEE_TOKEN:-}" ]]; then
  echo "缺少 GITEE_TOKEN" >&2
  exit 1
fi

API="https://gitee.com/api/v5"
AUTH=("access_token=${GITEE_TOKEN}")

echo "==> 查找/创建 Gitee Release: ${OWNER}/${REPO} ${TAG}"

RELEASE_JSON="$(curl -sS -G "${API}/repos/${OWNER}/${REPO}/releases/tags/${TAG}" \
  --data-urlencode "access_token=${GITEE_TOKEN}" || true)"

RELEASE_ID="$(node -e 'const j=JSON.parse(process.argv[1]||"{}"); if(!j.id) process.exit(2); process.stdout.write(String(j.id))' "${RELEASE_JSON}" 2>/dev/null || true)"

if [[ -z "${RELEASE_ID}" ]]; then
  echo "==> Release 不存在，正在创建…"
  BODY="MPT ${TAG} 桌面安装包（由 GitHub Actions 自动同步）"
  RELEASE_JSON="$(curl -sS -X POST "${API}/repos/${OWNER}/${REPO}/releases" \
    --data-urlencode "access_token=${GITEE_TOKEN}" \
    --data-urlencode "tag_name=${TAG}" \
    --data-urlencode "name=MPT ${TAG}" \
    --data-urlencode "body=${BODY}" \
    --data-urlencode "target_commitish=main")"
  RELEASE_ID="$(node -e 'const j=JSON.parse(process.argv[1]); if(!j.id){console.error(process.argv[1]); process.exit(1)}; process.stdout.write(String(j.id))' "${RELEASE_JSON}")"
fi

echo "==> Release id=${RELEASE_ID}"

# 列出已有附件，同名则先删，便于重复发布覆盖
EXISTING="$(curl -sS -G "${API}/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/attach_files" \
  --data-urlencode "access_token=${GITEE_TOKEN}" || echo '[]')"

upload_one() {
  local file="$1"
  local name
  name="$(basename "${file}")"
  local size
  size="$(wc -c <"${file}" | tr -d ' ')"
  echo "==> 上传 ${name} ($(( size / 1024 / 1024 )) MB)"

  # 删除同名旧附件
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
  if ! upload_one "${f}"; then
    failed=1
  fi
done

echo "==> Gitee Release: https://gitee.com/${OWNER}/${REPO}/releases/${TAG}"
exit "${failed}"
