import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { CHECKPOINTS, landingPoint, platformLocalPoint, platformWorldPoint } from '../src/level.js';
const tick = (g, count, input = {}) => { for (let i = 0; i < count; i++) g.step(input, 1 / 60); };

test('grounded jump rises and holding jump cannot jump again in the air', async () => {
  const g = await createGame(); g.start(); tick(g, 60); const y = g.position.y;
  g.step({ jump: true }, 1 / 60); tick(g, 18, { jump: true }); assert.ok(g.position.y > y + 1);
  const v = g.body.linvel().y; tick(g, 8, { jump: true }); assert.ok(g.body.linvel().y < v); g.world.free();
});
test('falling returns to the latest flag', async () => {
  const g = await createGame(); g.start(); const p = g.platforms[CHECKPOINTS[0]];
  g.body.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true); tick(g, 60);
  assert.equal(g.checkpoint, p.id);
  g.body.setTranslation({ x: 90, y: -30, z: 90 }, true); tick(g, 2);
  assert.equal(g.falls, 1); assert.ok(Math.abs(g.position.x - p.x) < .1); g.world.free();
});
test('pause freezes movement and timer; reset clears progress and resets moving platforms', async () => {
  const g = await createGame(); g.start(); tick(g, 100); g.pause();
  const pos = { ...g.position }, elapsed = g.elapsed; tick(g, 60, { z: -1, jump: true });
  assert.deepEqual({ ...g.position }, pos); assert.equal(g.elapsed, elapsed);
  g.reset(); assert.equal(g.elapsed, 0); assert.equal(g.checkpoint, 0);
  for (const p of g.platforms) { assert.equal(p.x, p.base.x); assert.equal(p.angle, p.base.angle); }
  g.world.free();
});
test('the summit finishes the run and ends the timer', async () => {
  const g = await createGame(); g.start(); const p = g.platforms.at(-1);
  g.body.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true); tick(g, 60);
  assert.equal(g.won, true); const t = g.elapsed;
  tick(g, 60); assert.equal(g.elapsed, t); g.world.free();
});
test('touching a sweeper keeps the player in the run; only a subsequent fall respawns', async () => {
  const g = await createGame(); g.start(); const p = g.platforms.find(p => p.hazard);
  try {
    g.body.setTranslation({ x: p.x, y: p.y + .65, z: p.z }, true); tick(g, 60);
    assert.equal(g.falls, 0);
    assert.ok(!g.events.includes('respawn'));
    assert.ok(Math.hypot(g.position.x - p.x, g.position.z - p.z) < 1);
    assert.ok(Math.hypot(g.position.x - p.x, g.position.z - p.z) > .2, 'the bar pushes the player aside');
    assert.ok(g.position.y > p.y + .5, 'the player remains on the platform');
    g.body.setTranslation({ x: p.x, y: p.y + 2, z: p.z }, true);
    g.body.setLinvel({ x: 0, y: 0, z: 0 }, true); tick(g, 60);
    assert.equal(g.falls, 0);
    assert.ok(g.position.y > p.y + .9, 'landing on the bar is also allowed');
    g.body.setTranslation({ x: 90, y: -30, z: 90 }, true); tick(g, 2);
    assert.equal(g.falls, 1); assert.ok(g.events.includes('respawn'));
    assert.ok(Math.abs(g.position.x - g.platforms[0].x) < .01);
  } finally { g.world.free(); }
});
test('gold landing markers on sweeper platforms are safe for a full rotation', async () => {
  for (const id of [10, 26, 38, 52]) {
    const g = await createGame();
    try {
      g.start(); const p = g.platforms[id], target = landingPoint(p);
      // Drop onto the actual marked spot and remain through a full sweep.
      g.body.setTranslation({ ...target, y: p.y + 2 }, true);
      tick(g, 360);
      assert.equal(g.falls, 0, `marked landing on platform ${id} must be safe`);
      assert.equal(g.lastPlatform, id);
      assert.ok(Math.abs(g.position.y - p.y - .6) < .1);
    } finally { g.world.free(); }
  }
});
for (const kind of ['moving', 'rotating']) {
  test(`a standing rider stays on a ${kind} platform without input`, async () => {
    const g = await createGame(); g.start(); const p = g.platforms.find(p => p.kind === kind);
    const point = platformWorldPoint(p, { x: 0, z: kind === 'rotating' ? 1.5 : 0 });
    g.body.setTranslation({ ...point, y: p.y + .65 }, true); tick(g, 30);
    const before = platformLocalPoint(p, g.position); tick(g, 180);
    const after = platformLocalPoint(p, g.position);
    assert.equal(g.falls, 0); assert.ok(Math.abs(after.x - before.x) < .15); assert.ok(Math.abs(after.z - before.z) < .15);
    assert.ok(Math.abs(g.position.y - (p.y + .6)) < .1); g.world.free();
  });
}
