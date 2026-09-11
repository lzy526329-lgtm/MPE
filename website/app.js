const REPO = 'lzy526329-lgtm/MPE';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const LATEST_URL = `${RELEASES_URL}/latest`;
const API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const PREVIEWS = {
  farm: { name: '农场', title: '种下去，等一个小小的收获。', description: '播种、浇水、除虫、收割，再把喜欢的装饰摆进农场。', alt: 'MPT 农场：24 块等距田地、作物与装饰摆放' },
  fishing: { name: '鱼塘', title: '放慢一点，等鱼儿咬钩。', description: '选一份鱼饵，抛竿、收线，把新的鱼获带回背包。', alt: 'MPT 鱼塘：水面、鱼获背包、鱼类图鉴和普通与高级鱼饵' },
  characters: { name: '宠物形象', title: '它有自己的每一个小动作。', description: '走路、打盹、互动，挑一个喜欢的形象，陪在桌面上。', alt: 'MPT 丘比特形象的多种动画姿态预览' },
  care: { name: '日常照顾', title: '每天见面，也记得照顾。', description: '喂食、清洁、休息，留意小伙伴的饱食、卫生和心情。', alt: 'MPT 宠物状态面板：饱食度、卫生、健康、心情和照顾操作' },
  chat: { name: 'AI 对话', title: '今天的事，说给它听。', description: '连接你自己的 AI 服务，和有名字、有性格的小伙伴聊聊天。', alt: 'MPT 连接 DeepSeek 后与宠物豆豆对话的实际聊天窗口' },
  reminders: { name: '交流提醒', title: '你的节奏，它记在心里。', description: '喝水、休息、下班打卡，可设置循环、单次或定时提醒。', alt: 'MPT 提醒设置：喝水和下班提醒，以及提醒时间和内容编辑' },
  profile: { name: '宠物资料', title: '从初次见面，到越来越熟。', description: '名字、性格、生日与成长等级，一点点记录你们的相处。', alt: 'MPT 宠物基础资料：名称、性格、生日、成长等级与金币' },
};
const platform = detectPlatform();
window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
initPreview();
markPlatform();
void loadContent();

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return null;
  if (/windows/.test(ua)) return 'win';
  if (/macintosh|mac os x/.test(ua)) return 'mac';
  if (/linux/.test(ua)) return 'linux';
  return null;
}

function markPlatform() {
  document.querySelectorAll('[data-platform]').forEach(option => {
    const selected = option.dataset.platform === platform;
    option.classList.toggle('is-preferred', selected);
    option.querySelector('.recommended').hidden = !selected;
  });
  const label = document.querySelector('[data-preferred-label]');
  if (platform) label.textContent = `下载 ${{ win: 'Windows', mac: 'macOS', linux: 'Linux' }[platform]} 版`;
  else document.querySelector('[data-dl="preferred"]').href = '#download';
}

function initPreview() {
  const tabs = [...document.querySelectorAll('[data-preview]')];
  const image = document.querySelector('#preview-image');
  const dialog = document.querySelector('#screenshot-dialog');
  const opener = document.querySelector('#open-screenshot');
  let selected = 'farm';
  function select(tab, focus = false) {
    selected = tab.dataset.preview;
    const preview = PREVIEWS[selected];
    tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    image.src = `./assets/screenshots/${selected}.webp`;
    image.alt = preview.alt;
    document.querySelector('#preview-name').textContent = preview.title;
    document.querySelector('#preview-description').textContent = preview.description;
    document.querySelector('#preview-panel').setAttribute('aria-labelledby', tab.id);
    opener.setAttribute('aria-label', `放大查看${preview.name}截图`);
    if (focus) { tab.focus({ preventScroll: true }); tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[next], true);
    });
  });
  opener.addEventListener('click', () => {
    const fullImage = document.querySelector('#lightbox-image');
    fullImage.src = image.src;
    fullImage.alt = image.alt;
    document.querySelector('#lightbox-title').textContent = PREVIEWS[selected].name;
    dialog.showModal();
  });
  document.querySelector('#close-screenshot').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => opener.focus({ preventScroll: true }));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function loadContent() {
  const result = await fetchJson(API).catch(() => []);
  const remote = Array.isArray(result) ? result : [];
  const stable = remote.filter(item => item && !item.prerelease && !item.draft && typeof item.tag_name === 'string');
  wireDownloads(stable[0]);
}

function validDownloadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(`/${REPO}/releases/download/`) ? url.href : null;
  } catch { return null; }
}

function wireDownloads(latest) {
  const patterns = { win: /^MPT-.*-win-x64\.exe$/i, mac: /^MPT-.*-mac-arm64\.dmg$/i, linux: /^MPT-.*-linux-(?:x64|x86_64)\.AppImage$/i };
  const suffixes = { win: '.exe', mac: '.dmg', linux: 'AppImage' };
  const assets = Array.isArray(latest?.assets) ? latest.assets : [];
  const byPlatform = Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, assets.find(asset => typeof asset.name === 'string' && pattern.test(asset.name) && validDownloadUrl(asset.browser_download_url))]));
  document.querySelectorAll('[data-dl]').forEach(link => {
    const kind = link.dataset.dl === 'preferred' ? platform : link.dataset.dl;
    if (!kind) return;
    const asset = byPlatform[kind];
    link.href = validDownloadUrl(asset?.browser_download_url) || LATEST_URL;
    const label = link.querySelector('[data-download-label]');
    if (label && asset) label.textContent = `下载 ${suffixes[kind]}`;
  });
  Object.entries(byPlatform).forEach(([kind, asset]) => {
    if (!asset) return;
    const size = Number.isFinite(asset.size) && asset.size > 0 ? ` · ${Math.round(asset.size / 1024 / 1024)} MB` : '';
    document.querySelector(`[data-file-meta="${kind}"]`).textContent = `${latest.tag_name} · ${suffixes[kind]}${size}`;
  });
  document.querySelectorAll('[data-release-version]').forEach(node => { node.textContent = latest ? `${latest.tag_name} 正式版` : 'GitHub 正式版'; });
  document.querySelector('#release-status').textContent = latest ? `${latest.tag_name} · 最新正式版` : '暂未获取版本信息，可前往 GitHub 下载正式版。';
}
