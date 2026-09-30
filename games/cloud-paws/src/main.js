import './style.css';
import { createGame } from './game.js';
import { createWorld } from './world.js';
import { mountHostVisibility } from './host.js';
import { LEVEL, SUMMIT, STAGES, TOTAL_STARS, HEIGHT_SCALE } from './level.js';
import { createCameraState, cameraRelativeMovement, resetCameraForRoute, mountCameraControls } from './camera.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const keys = new Set();
const orbit = createCameraState();
const bestKey = 'cloud-paws-spiral-v2-best';
const maxHeight = Math.round(SUMMIT.y * HEIGHT_SCALE);
let game, view, cameraControls, audio, toastTimer;
let mode = 'menu', returnMode = 'menu', selected = 'fox';
let jumpQueued = false, sound = false, best = 0;
let animationFrame = 0, accumulator = 0, last = 0, clock = 0;
try { best = Number(localStorage.getItem(bestKey)) || 0; } catch {}
const timeString = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const kindLabels = { bridge: '窄桥 · 稳住方向', rotating: '旋转横梁 · 等待角度', moving: '移动平台 · 看准时机', spinner: '旋转木杆 · 先落金圈，再避开木杆', steps: '错位石阶', checkpoint: '前方存档点', summit: '最后一跳！', island: '沿着金色标记前进' };
$('height-total').textContent = `/ ${maxHeight} m`;
$('star-total').textContent = `/ ${TOTAL_STARS}`;
$('route-description').textContent = `盘旋云山 · ${LEVEL.length - 1} 段挑战 · ${maxHeight} m`;

function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}
function tone(frequency, duration = .12, kind = 'sine') {
  if (!sound || !audio) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = kind;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.25, audio.currentTime + duration);
  gain.gain.setValueAtTime(.045, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + duration);
}
function clearInputs() {
  keys.clear(); jumpQueued = false; accumulator = 0;
  document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
}
function showPlayingUI(playing) {
  for (const id of ['menu', 'menu-bottom', 'world-label']) $(id).classList.toggle('hidden', playing);
  for (const id of ['hud', 'hint', 'pause', 'camera-mode', 'camera-reset']) $(id).classList.toggle('hidden', !playing);
  $('touch').classList.toggle('hidden', !playing || !matchMedia('(pointer:coarse), (max-width:700px)').matches);
  document.body.classList.toggle('playing', playing);
}
function closeDialog() { $('dialog').classList.add('hidden'); clearInputs(); }
function faceRoute() { if (game) resetCameraForRoute(orbit, game.position, game.nextPlatform); }
function captureMouse() {
  canvas.focus({ preventScroll: true });
  if (!matchMedia('(pointer:coarse)').matches) cameraControls?.lock();
}
function start() {
  if (!game) return;
  closeDialog(); game.reset(); view.setAnimal(selected); faceRoute();
  mode = 'playing'; game.start(); showPlayingUI(true);
  toast('鼠标看四周，左键跳跃，WASD 随视角移动。');
  tone(440, .18); captureMouse();
}
function menu() {
  mode = 'menu'; cameraControls?.release(); closeDialog(); game.reset();
  showPlayingUI(false); $('start').focus({ preventScroll: true });
}
function resume() {
  closeDialog();
  if (returnMode === 'menu') { mode = 'menu'; $('help').focus({ preventScroll: true }); }
  else { mode = 'playing'; game.start(); captureMouse(); }
}
function openDialog(kind) {
  if (!game) return;
  returnMode = mode === 'menu' ? 'menu' : 'playing';
  game.pause(); mode = 'paused'; cameraControls?.release(); clearInputs();
  $('dialog').classList.remove('hidden');
  $('restart').classList.toggle('hidden', returnMode === 'menu');
  $('home').classList.toggle('hidden', returnMode === 'menu');
  if (kind === 'help') {
    $('dialog-kicker').textContent = 'LOOK AROUND. FIND YOUR WAY.';
    $('dialog-title').textContent = '转过山角，路还在上面';
    $('dialog-body').innerHTML = '<div class="controls-table"><kbd>鼠标 / 右键拖动</kbd><span>360° 转动视角</span><kbd>滚轮</kbd><span>调整镜头远近</span><kbd>WASD / 方向键</kbd><span>按视角方向移动</span><kbd>左键 / 空格</kbd><span>跳跃</span><kbd>Shift</kbd><span>加速</span><kbd>C / Q E</kbd><span>朝向下一段 / 转向</span><kbd>R / Esc</kbd><span>返回存档 / 释放鼠标并暂停</span></div><p>左键点击画面跳跃并启用鼠标视角，Esc 释放鼠标。<br>金色箭头标出下一块平台，每 12 段存档。<br>碰到旋转木杆不会回档，稳住脚步，掉下去才返回存档点。<br>旋转横梁会带着你转，等待对齐再跳。<br>触屏：拖动画面转视角，按钮移动和跳跃。</p>';
    $('resume').firstElementChild.textContent = returnMode === 'menu' ? '知道啦，出发吧' : '继续冒险';
  } else {
    $('dialog-kicker').textContent = 'TAKE A BREATH'; $('dialog-title').textContent = '在云里歇一会儿';
    $('dialog-body').innerHTML = `<p>鼠标已释放，准备好再继续。<br>到达 ${Math.round(game.highest * HEIGHT_SCALE)} m · ${game.collected.size} 颗星星<br>${STAGES[Math.min(4, Math.floor(game.checkpoint / 12))].name}</p>`;
    $('resume').firstElementChild.textContent = '继续冒险';
  }
  $('resume').focus({ preventScroll: true });
}
function win() {
  mode = 'won'; cameraControls.release(); clearInputs();
  const record = !best || game.elapsed < best;
  if (record) { best = game.elapsed; try { localStorage.setItem(bestKey, String(best)); } catch {} }
  $('dialog').classList.remove('hidden');
  $('dialog-kicker').textContent = 'YOU MADE IT TO THE CLOUDS';
  $('dialog-title').textContent = '绕过整座山，终于登顶！';
  $('dialog-body').innerHTML = `<div class="result-grid"><div><b>${timeString(game.elapsed)}</b><span>登顶用时</span></div><div><b>${game.collected.size} / ${TOTAL_STARS}</b><span>收集星星</span></div><div><b>${game.falls}</b><span>重新出发</span></div></div><p>${record ? '✦ 创造了新的个人纪录！' : '个人最佳 ' + timeString(best)}<br>${LEVEL.length - 1} 段挑战，每一跳都算数。</p>`;
  $('resume').firstElementChild.textContent = '再冒险一次';
  $('restart').classList.add('hidden'); $('home').classList.remove('hidden');
  $('resume').focus({ preventScroll: true }); view.burst(game.position); tone(660, .4);
}
$('start').addEventListener('click', start);
$('pause').addEventListener('click', () => openDialog('pause'));
$('help').addEventListener('click', () => openDialog('help'));
$('restart').addEventListener('click', start);
$('home').addEventListener('click', menu);
$('resume').addEventListener('click', () => mode === 'won' ? start() : resume());
$('camera-mode').addEventListener('click', captureMouse);
$('camera-reset').addEventListener('click', () => { faceRoute(); canvas.focus(); });
$('sound').addEventListener('click', () => {
  sound = !sound; $('sound').classList.toggle('sound-on', sound);
  $('sound').setAttribute('aria-label', sound ? '关闭音效' : '开启音效');
  if (sound) {
    try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); tone(600); }
    catch { sound = false; toast('当前浏览器暂不支持音效'); }
  }
});
document.querySelectorAll('[data-animal]').forEach(button => button.addEventListener('click', () => {
  selected = button.dataset.animal; view?.setAnimal(selected);
  document.querySelectorAll('[data-animal]').forEach(b => {
    const active = b === button; b.classList.toggle('selected', active); b.setAttribute('aria-pressed', String(active));
  });
  tone(500, .08);
}));
const gameKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyC', 'KeyQ', 'KeyE'];
window.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    event.preventDefault();
    if (mode === 'playing') openDialog('pause');
    else if (mode === 'paused' && !event.repeat) resume();
    return;
  }
  if (event.code === 'Tab' && !$('dialog').classList.contains('hidden')) {
    const buttons = [...$('dialog').querySelectorAll('button:not(.hidden)')];
    const first = buttons[0], end = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end.focus(); }
    else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first.focus(); }
    return;
  }
  if (mode !== 'playing') return;
  if (gameKeys.includes(event.code)) {
    event.preventDefault(); keys.add(event.code);
    if (event.code === 'Space' && !event.repeat) jumpQueued = true;
  }
  if (event.code === 'KeyR' && !event.repeat) game.respawn();
  if (event.code === 'KeyC' && !event.repeat) faceRoute();
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearInputs(); if (mode === 'playing') openDialog('pause'); });
document.querySelectorAll('[data-key]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault(); if (mode !== 'playing') return;
    button.setPointerCapture(event.pointerId); keys.add(button.dataset.key);
    if (button.dataset.key === 'Space') jumpQueued = true;
    button.classList.add('pressed');
  });
  const release = () => { keys.delete(button.dataset.key); button.classList.remove('pressed'); };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, release);
});
function input() {
  return cameraRelativeMovement({
    x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    z: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')),
    jump: keys.has('Space') || jumpQueued, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  }, orbit.yaw);
}
function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0, .1); last = now; clock += dt;
  if (mode === 'playing') {
    orbit.yaw += (Number(keys.has('KeyQ')) - Number(keys.has('KeyE'))) * dt * 1.8;
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      game.step(input(), 1 / 60); jumpQueued = false; accumulator -= 1 / 60;
      if (game.won) break;
    }
  }
  const events = game.events.splice(0);
  for (const event of events) {
    if (event === 'jump') tone(310, .12);
    if (event === 'star') { tone(780, .14); view.burst(game.position); }
    if (event === 'checkpoint') { toast('旗帜已点亮！下一段，换个角度继续向上'); tone(550, .25); }
    if (event === 'respawn') { faceRoute(); toast('已回到存档点。看准金色标记，再出发。'); }
    if (event === 'win') win();
  }
  $('height').textContent = Math.min(maxHeight, Math.max(0, Math.round((game.position.y - .6) * HEIGHT_SCALE)));
  $('progress').style.width = `${Math.min(100, game.highest / SUMMIT.y * 100)}%`;
  $('stars').textContent = game.collected.size; $('timer').textContent = timeString(game.elapsed);
  $('stage').textContent = STAGES[game.platforms[game.lastPlatform].stage].name;
  $('route-step').textContent = `${game.lastPlatform} / ${LEVEL.length - 1} 段 · ${kindLabels[game.nextPlatform.kind]}`;
  const viewMode = mode === 'menu' || (mode === 'paused' && returnMode === 'menu') ? 'menu' : 'playing';
  view.render(dt, viewMode === 'menu' ? clock : game.time, viewMode);
  if (visibility.isVisible()) animationFrame = requestAnimationFrame(frame);
}
async function boot() {
  try {
    game = await createGame(); faceRoute(); view = createWorld(canvas, game, orbit);
    cameraControls = mountCameraControls(canvas, orbit, {
      isPlaying: () => mode === 'playing', onUnlock: () => openDialog('pause'),
      onJump: () => { jumpQueued = true; },
      onLockChange: locked => {
        $('camera-mode').textContent = locked ? '左键跳跃 · Esc 释放鼠标' : '左键跳跃 · 右键拖动视角';
        document.body.classList.toggle('camera-locked', locked);
      },
    });
    $('start').disabled = false; $('start-label').textContent = '挑战盘旋云山';
    if (visibility.isVisible()) animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    $('error').textContent = '云朵暂时没能准备好。请确认浏览器已开启硬件加速，刷新页面后再试。';
    $('error').classList.remove('hidden'); $('start-label').textContent = '加载失败，请刷新';
  }
}
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (mode === 'playing') openDialog('pause'); toast('画面连接暂时中断，正在等待恢复…'); });
canvas.addEventListener('webglcontextrestored', () => toast('画面已恢复，点击继续冒险'));
window.addEventListener('resize', () => { if (mode === 'playing') showPlayingUI(true); });
const visibility = mountHostVisibility({
  onHide() { clearInputs(); if (mode === 'playing') openDialog('pause'); cameraControls?.release(); cancelAnimationFrame(animationFrame); audio?.suspend(); },
  onShow() { last = performance.now(); accumulator = 0; if (view) { cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(frame); } if (sound) audio?.resume(); },
});
window.addEventListener('beforeunload', () => { visibility.dispose(); cameraControls?.dispose(); cancelAnimationFrame(animationFrame); audio?.close(); });
boot();
