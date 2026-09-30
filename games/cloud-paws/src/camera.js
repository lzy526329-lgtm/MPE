const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function createCameraState() { return { yaw: 0, pitch: 0.42, distance: 10 }; }
export function rotateCamera(state, dx, dy) {
  state.yaw -= dx * 0.004;
  state.pitch = clamp(state.pitch + dy * 0.0035, 0.16, 1.16);
}
export function zoomCamera(state, delta) { state.distance = clamp(state.distance + delta * 0.012, 4.5, 16); }
export function cameraRelativeMovement(input, yaw) {
  return { ...input, x: input.x * Math.cos(yaw) + input.z * Math.sin(yaw), z: -input.x * Math.sin(yaw) + input.z * Math.cos(yaw) };
}
export function resetCameraForRoute(state, player, next) {
  if (next && Math.hypot(next.x - player.x, next.z - player.z) > 0.1) {
    state.yaw = Math.atan2(player.x - next.x, player.z - next.z);
  }
  state.pitch = 0.42;
}

/** Pointer lock is optional: dragging and touch still work if the host declines it. */
export function mountCameraControls(canvas, state, { isPlaying, onUnlock, onLockChange, onJump }) {
  let drag = null;
  let wasLocked = false;
  const locked = () => document.pointerLockElement === canvas;
  const lock = () => {
    if (!isPlaying() || locked() || !canvas.requestPointerLock) return;
    canvas.focus({ preventScroll: true });
    try { Promise.resolve(canvas.requestPointerLock()).catch(() => onLockChange(false)); }
    catch { onLockChange(false); }
  };
  const release = () => {
    drag = null;
    if (locked()) document.exitPointerLock();
  };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (!isPlaying()) return;
    if (e.pointerType === 'mouse' && e.button === 0) {
      e.preventDefault();
      onJump?.();
      lock();
      return;
    }
    if (locked()) return;
    if (e.pointerType === 'touch' || e.button === 2) {
      e.preventDefault(); canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (e.button === 0) lock();
  });
  canvas.addEventListener('pointermove', e => {
    if (!isPlaying() || !drag || e.pointerId !== drag.id) return;
    rotateCamera(state, e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = e => { if (drag?.id === e.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('wheel', e => {
    if (!isPlaying()) return;
    e.preventDefault(); zoomCamera(state, e.deltaY);
  }, { passive: false });
  const mousemove = e => { if (locked() && isPlaying()) rotateCamera(state, e.movementX, e.movementY); };
  const lockchange = () => {
    const now = locked();
    onLockChange(now);
    if (wasLocked && !now && isPlaying()) onUnlock();
    wasLocked = now;
  };
  const lockerror = () => onLockChange(false);
  document.addEventListener('mousemove', mousemove);
  document.addEventListener('pointerlockchange', lockchange);
  document.addEventListener('pointerlockerror', lockerror);
  return {
    lock, release, locked,
    dispose() {
      release();
      document.removeEventListener('mousemove', mousemove);
      document.removeEventListener('pointerlockchange', lockchange);
      document.removeEventListener('pointerlockerror', lockerror);
    },
  };
}
