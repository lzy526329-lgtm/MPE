import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraState, rotateCamera, zoomCamera, cameraRelativeMovement, resetCameraForRoute } from '../src/camera.js';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('forward and strafe follow camera heading through a full turn',()=>{
 const input={x:0,z:-1,jump:true};
 const north=cameraRelativeMovement(input,0);near(north.x,0);near(north.z,-1);assert.equal(north.jump,true);
 const west=cameraRelativeMovement(input,Math.PI/2);near(west.x,-1);near(west.z,0);
 const south=cameraRelativeMovement(input,Math.PI);near(south.x,0);near(south.z,1);
 const strafe=cameraRelativeMovement({x:1,z:0},Math.PI/2);near(strafe.x,0);near(strafe.z,-1);
});
test('mouse orbit changes heading, clamps elevation and zoom to playable limits',()=>{
 const state=createCameraState();const yaw=state.yaw;rotateCamera(state,200,50);assert.notEqual(state.yaw,yaw);
 rotateCamera(state,0,100000);assert.ok(state.pitch<=1.2);rotateCamera(state,0,-100000);assert.ok(state.pitch>=.12);
 zoomCamera(state,-10000);assert.ok(state.distance>=4);zoomCamera(state,10000);assert.ok(state.distance<=18);
});
test('reset faces the next platform and never changes the player position',()=>{
 const state=createCameraState();const player={x:10,y:2,z:20};const target={x:14,y:3,z:20};resetCameraForRoute(state,player,target);
 const forward=cameraRelativeMovement({x:0,z:-1},state.yaw);near(forward.x,1);near(forward.z,0);assert.deepEqual(player,{x:10,y:2,z:20});
});

test('left mouse press jumps with or without pointer lock, but UI states and touch dragging do not', async t => {
 const { mountCameraControls } = await import('../src/camera.js');
 const previousDocument = globalThis.document;
 const doc = new EventTarget();
 globalThis.document = doc;
 t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
 const canvas = new EventTarget();
 let jumps = 0, locks = 0, playing = true;
 canvas.focus = () => {};
 canvas.setPointerCapture = () => {};
 canvas.requestPointerLock = () => { locks++; };
 doc.exitPointerLock = () => { doc.pointerLockElement = null; };
 const state = createCameraState();
 const controls = mountCameraControls(canvas, state, {
  isPlaying: () => playing, onUnlock() {}, onLockChange() {}, onJump: () => jumps++,
 });
 const press = (button, pointerType = 'mouse') => {
  const event = new Event('pointerdown', { cancelable: true });
  Object.assign(event, { button, pointerType, pointerId: 1, clientX: 0, clientY: 0 });
  canvas.dispatchEvent(event);
 };
 press(0); assert.equal(jumps, 1); assert.equal(locks, 1);
 doc.pointerLockElement = canvas;
 press(0); assert.equal(jumps, 2); assert.equal(locks, 1);
 press(2); assert.equal(jumps, 2);
 playing = false; press(0); assert.equal(jumps, 2);
 playing = true; doc.pointerLockElement = null;
 press(0, 'touch'); assert.equal(jumps, 2);
 controls.dispose();
});
