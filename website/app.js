import { mountPet } from "./pet-player.bundle.js";

const REPO = "lzy526329-lgtm/MPE";
const API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const pollen = document.querySelector("#pollen");
const logList = document.querySelector("#log-list");
const dlMeta = document.querySelector("#dl-meta");
const macHint = document.querySelector("#mac-hint");
const heroField = document.querySelector("[data-parallax]");
const nav = document.querySelector("#nav");

const os = detectOs();

initScenes();
initPlots();
initPollen();
initParallax();
initNav();
void loadContent();
void mountVisiblePets();

function initNav() {
  if (!nav) return;
  const sync = () => {
    nav.classList.toggle("is-solid", window.scrollY > 40);
  };
  sync();
  window.addEventListener("scroll", sync, { passive: true });
}

async function mountVisiblePets() {
  const hosts = [...document.querySelectorAll("[data-pet]")].filter((host) => {
    if (!(host instanceof HTMLElement)) return false;
    const scene = host.closest(".scene");
    if (scene && !scene.classList.contains("is-on")) return false;
    return true;
  });
  for (const host of hosts) {
    const mode = host.dataset.pet === "walk" ? "walk" : "idle";
    try {
      await mountPet(host, { mode });
    } catch (error) {
      console.warn("宠物加载失败", error);
      host.classList.add("pet-host--failed");
    }
  }
}

function detectOs() {
  const ua = navigator.userAgent.toLowerCase();
  if (/mac os x|macintosh/.test(ua) && !/iphone|ipad/.test(ua)) return "mac";
  if (/windows/.test(ua)) return "win";
  if (/linux/.test(ua)) return "linux";
  return "win";
}

function initScenes() {
  const buttons = [...document.querySelectorAll(".scene-switch button")];
  const scenes = [...document.querySelectorAll(".scene")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = button.dataset.scene;
      for (const item of buttons) {
        const on = item === button;
        item.classList.toggle("is-on", on);
        item.setAttribute("aria-selected", String(on));
      }
      for (const scene of scenes) {
        const on = scene.dataset.scene === id;
        scene.classList.toggle("is-on", on);
        scene.hidden = !on;
      }
      void mountVisiblePets();
    });
  }
}

function initPlots() {
  for (const plot of document.querySelectorAll(".plot")) {
    plot.addEventListener("click", () => {
      const drop = document.createElement("span");
      drop.className = "splash";
      plot.append(drop);
      drop.addEventListener("animationend", () => drop.remove());
    });
  }
}

function initParallax() {
  if (!heroField || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bg = heroField.querySelector(".hero-bg");
  window.addEventListener(
    "pointermove",
    (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 12;
      const y = (event.clientY / window.innerHeight - 0.5) * 8;
      bg.style.transform = `translate(${x}px, ${y}px) scale(1.04)`;
    },
    { passive: true },
  );
}

function initPollen() {
  if (!(pollen instanceof HTMLCanvasElement)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = pollen.getContext("2d");
  if (!ctx) return;

  const dots = Array.from({ length: 42 }, () => spawn());

  function spawn() {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 1.1 + Math.random() * 2.2,
      s: 0.25 + Math.random() * 0.7,
      a: 0.18 + Math.random() * 0.35,
    };
  }

  function resize() {
    pollen.width = window.innerWidth * devicePixelRatio;
    pollen.height = window.innerHeight * devicePixelRatio;
    pollen.style.width = `${window.innerWidth}px`;
    pollen.style.height = `${window.innerHeight}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const dot of dots) {
      dot.y -= dot.s;
      dot.x += Math.sin(dot.y / 40) * 0.35;
      if (dot.y < -8) {
        dot.y = window.innerHeight + 8;
        dot.x = Math.random() * window.innerWidth;
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 236, 170, ${dot.a})`;
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener("resize", resize);
  tick();
}

async function loadContent() {
  const local = await fetch("./changelog.json").then((res) => res.json());
  let remote = [];
  try {
    const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
    if (res.ok) remote = await res.json();
  } catch {
    remote = [];
  }

  const stable = remote.filter((item) => !item.prerelease && !item.draft);
  const latest = stable[0];
  renderChangelog(local.releases, latest?.tag_name);
  wireDownloads(latest, local.releases[0]?.tag);
}

function renderChangelog(releases, latestTag) {
  logList.innerHTML = "";
  for (const release of releases) {
    const item = document.createElement("li");
    item.className = "log-item";
    const current = release.tag === latestTag ? " · 最新" : "";
    item.innerHTML = `
      <time datetime="${release.date}">${release.date} · ${release.tag}${current}</time>
      <h3>${escapeHtml(release.title)}</h3>
      <ul>${release.items.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    `;
    logList.append(item);
  }
}

function wireDownloads(latest, fallbackTag) {
  const tag = (latest?.tag_name || fallbackTag || "v1.0.15").replace(/^v/, "");
  const assets = latest?.assets ?? [];
  const map = {
    win: pickAsset(assets, /MPT-.*-win-x64\.exe$/i) ?? fallbackUrl(tag, "win-x64.exe"),
    mac: pickAsset(assets, /MPT-.*-mac-arm64\.dmg$/i) ?? fallbackUrl(tag, "mac-arm64.dmg"),
    linux: pickAsset(assets, /MPT-.*-linux-x86_64\.AppImage$/i) ?? fallbackUrl(tag, "linux-x86_64.AppImage"),
  };

  for (const link of document.querySelectorAll("[data-dl]")) {
    const kind = link.dataset.dl;
    link.href = map[kind] || fallbackUrl(tag, "win-x64.exe");
    link.classList.toggle("is-preferred", kind === os);
  }

  if (dlMeta) dlMeta.textContent = `当前正式版 v${tag}`;
  if (macHint) macHint.hidden = os !== "mac";
}

function pickAsset(assets, pattern) {
  const hit = assets.find((item) => pattern.test(item.name));
  return hit?.browser_download_url;
}

function fallbackUrl(version, suffix) {
  return `https://github.com/${REPO}/releases/latest/download/MPT-${version}-${suffix}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
