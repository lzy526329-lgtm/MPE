import RAPIER from '@dimforge/rapier3d-compat';
import { LEVEL, CORE, SUMMIT, containsPlatform, samplePlatform, platformLocalPoint, platformWorldPoint } from './level.js';
let initialized;
const rotation = angle => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
export const PLAYER_COLORS = [0xe8896d, 0x779bc5, 0x9abb7d, 0xb398cf, 0xe6bb64];

export async function createGame({ members = [{ id: 'local', name: '我', animal: 'fox' }], localId = members[0]?.id } = {}) {
  initialized ??= RAPIER.init(); await initialized;
  const world = new RAPIER.World({ x: 0, y: -22, z: 0 }); world.timestep = 1 / 60;
  const platformByCollider = new Map();
  const platforms = LEVEL.map(p => {
    const description = p.moving || p.rotating ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
    const body = world.createRigidBody(description.setTranslation(p.x, p.y - .24, p.z).setRotation(rotation(p.angle)));
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(p.w / 2, .24, p.d / 2).setFriction(0), body);
    const platform = { ...p, base: p, body, collider }; platformByCollider.set(collider.handle, platform); return platform;
  });
  for (const c of CORE) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
    world.createCollider(RAPIER.ColliderDesc.cylinder(c.height / 2, c.radius), body);
  }
  const hazards = platforms.filter(p => p.hazard).map(p => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + .4, p.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(2, .15, .15).setFriction(0), body);
    return { body, platform: p, angle: 0 };
  });
  const players = new Map();
  function addPlayer(member, slot) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().lockRotations().setCcdEnabled(true));
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(.3, .3).setFriction(0).setRestitution(0).setMass(1), body);
    const player = { id: String(member.id), name: member.name || '玩家', animal: member.animal === 'bunny' ? 'bunny' : 'fox', slot,
      body, collider, checkpoint: 0, falls: 0, highest: 0, lastPlatform: 0, grounded: false, won: false,
      finishedAt: null, rank: null, jumpHeld: false, buffer: 0, coyote: 0, events: [] };
    players.set(player.id, player); return player;
  }
  const game = {
    world, platforms, hazards, players, localId: String(localId), elapsed: 0, time: 0, running: false, finishOrder: [],
    get self() { return players.get(this.localId) || players.values().next().value; },
    get body() { return this.self.body; }, get position() { return this.body.translation(); },
    get nextPlatform() { return platforms[Math.min(this.lastPlatform + 1, platforms.length - 1)]; },
    start() { this.running = true; }, pause() { this.running = false; },
    setMembers(list, selectedId = this.localId) {
      if (!list.length || list.length > 5 || new Set(list.map(m => String(m.id))).size !== list.length) throw new Error('房间人数必须为 1–5 人，且不能重复');
      for (const p of players.values()) world.removeRigidBody(p.body);
      players.clear(); list.forEach(addPlayer); this.localId = String(selectedId); this.reset();
    },
    removePlayer(id) { const p = players.get(String(id)); if (p) { world.removeRigidBody(p.body); players.delete(p.id); } },
    respawn(count = true, id = this.localId) {
      const player = players.get(String(id)); if (!player || player.won) return;
      const p = platforms[player.checkpoint];
      const offset = players.size === 1 ? { x: 0, z: 0 } : { x: ((player.slot % 3) - 1) * 1.15, z: Math.floor(player.slot / 3) * 1.15 - .55 };
      const spawn = platformWorldPoint(p, offset);
      player.body.setTranslation({ ...spawn, y: p.y + .65 }, true); player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (count) player.falls++;
      player.lastPlatform = player.checkpoint; player.grounded = false; player.buffer = 0; player.coyote = 0;
      player.events.push('respawn');
    },
    reset() {
      this.elapsed = 0; this.time = 0; this.running = false; this.finishOrder = [];
      for (const p of platforms) {
        Object.assign(p, samplePlatform(p.base, 0));
        p.body.setTranslation({ x: p.x, y: p.y - .24, z: p.z }, true); p.body.setRotation(rotation(p.angle), true);
        if (p.moving || p.rotating) { p.body.setNextKinematicTranslation(p.body.translation()); p.body.setNextKinematicRotation(rotation(p.angle)); }
      }
      for (const h of hazards) { h.angle = 0; h.body.setRotation(rotation(0), true); h.body.setNextKinematicRotation(rotation(0)); }
      for (const p of players.values()) {
        Object.assign(p, { checkpoint: 0, falls: 0, highest: 0, lastPlatform: 0, grounded: false, won: false, finishedAt: null, rank: null, jumpHeld: false });
        p.body.setEnabled(true); this.respawn(false, p.id); p.events = [];
      }
      world.step();
    },
    cameraDistance(origin, direction, distance) {
      const hit = world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, this.self.collider, this.body,
        c => platformByCollider.has(c.handle) || c.parent()?.isFixed());
      return hit ? Math.max(1.4, hit.toi - .35) : distance;
    },
    step(input = {}, dt = 1 / 60) { this.stepPlayers(new Map([[this.localId, input]]), dt); },
    stepPlayers(inputs = new Map(), dt = 1 / 60) {
      if (!this.running) return;
      if ([...players.values()].every(p => p.won)) return;
      dt = Math.min(dt, 1 / 30); world.timestep = dt; this.elapsed += dt; this.time += dt;
      const supports = new Map();
      for (const p of players.values()) {
        if (p.won) continue;
        const hit = world.castRay(new RAPIER.Ray(p.body.translation(), { x: 0, y: -1, z: 0 }), .71, true, undefined, undefined, p.collider, p.body);
        p.grounded = Boolean(hit) && p.body.linvel().y < 1;
        const support = p.grounded && hit ? platformByCollider.get(hit.collider.handle) : null;
        if (support) supports.set(p.id, { support, local: platformLocalPoint(support, p.body.translation()) });
      }
      for (const p of platforms) {
        if (!p.moving && !p.rotating) continue;
        Object.assign(p, samplePlatform(p.base, this.time));
        for (const [id, s] of supports) if (s.support === p) {
          const rider = players.get(id); rider.body.setTranslation({ ...platformWorldPoint(p, s.local), y: rider.body.translation().y }, true);
        }
        p.body.setNextKinematicTranslation({ x: p.x, y: p.y - .24, z: p.z }); p.body.setNextKinematicRotation(rotation(p.angle));
      }
      for (const h of hazards) { h.angle = this.time * 1.3; h.body.setNextKinematicRotation(rotation(h.angle)); }
      for (const p of players.values()) {
        if (p.won) continue;
        const input = inputs.get(p.id) || {};
        if (p.grounded) p.coyote = .1; else p.coyote = Math.max(0, p.coyote - dt);
        if (input.jump && !p.jumpHeld) p.buffer = .13; else p.buffer = Math.max(0, p.buffer - dt);
        p.jumpHeld = Boolean(input.jump);
        const x = Number.isFinite(input.x) ? input.x : 0, z = Number.isFinite(input.z) ? input.z : 0;
        const length = Math.max(1, Math.hypot(x, z)), speed = input.sprint ? 8 : 6.6;
        const v = p.body.linvel(), blend = 1 - Math.exp(-(p.grounded ? 24 : 11) * dt);
        let vy = v.y;
        if (p.buffer > 0 && p.coyote > 0) { vy = 10.4; p.buffer = 0; p.coyote = 0; p.grounded = false; p.events.push('jump'); }
        p.body.setLinvel({ x: v.x + (x / length * speed - v.x) * blend, y: vy, z: v.z + (z / length * speed - v.z) * blend }, true);
      }
      world.step();
      for (const player of players.values()) {
        if (player.won) continue;
        const now = player.body.translation(); player.highest = Math.max(player.highest, Math.min(SUMMIT.y, now.y - .6));
        for (const p of platforms) {
          if (!containsPlatform(p, now, .06) || now.y < p.y + .48 || now.y > p.y + .74 || player.body.linvel().y >= 1) continue;
          player.lastPlatform = p.id;
          if (p.checkpoint && p.id > player.checkpoint) { player.checkpoint = p.id; player.events.push('checkpoint'); }
          if (p.kind === 'summit') {
            player.won = true; player.finishedAt = this.elapsed; player.rank = this.finishOrder.push(player.id);
            player.events.push('win'); player.body.setLinvel({ x: 0, y: 0, z: 0 }, true); player.body.setEnabled(false);
          }
        }
        if (now.y < platforms[player.checkpoint].y - 9) this.respawn(true, player.id);
      }
    },
    snapshot() {
      return { time: this.time, elapsed: this.elapsed, finishOrder: [...this.finishOrder], players: [...players.values()].map(p => ({
        id: p.id, name: p.name, animal: p.animal, slot: p.slot, position: { ...p.body.translation() }, velocity: { ...p.body.linvel() },
        checkpoint: p.checkpoint, falls: p.falls, highest: p.highest, lastPlatform: p.lastPlatform, grounded: p.grounded,
        won: p.won, finishedAt: p.finishedAt, rank: p.rank,
      })) };
    },
    applySnapshot(snapshot, blend = 1) {
      this.time = snapshot.time; this.elapsed = snapshot.elapsed; this.finishOrder = snapshot.finishOrder;
      for (const state of snapshot.players) {
        let p = players.get(state.id); if (!p) p = addPlayer(state, state.slot);
        const previous = p.body.translation(), distance = Math.hypot(previous.x - state.position.x, previous.y - state.position.y, previous.z - state.position.z);
        const factor = distance > 3 ? 1 : blend;
        p.body.setTranslation({ x: previous.x + (state.position.x - previous.x) * factor, y: previous.y + (state.position.y - previous.y) * factor, z: previous.z + (state.position.z - previous.z) * factor }, true);
        p.body.setLinvel(state.velocity, true);
        for (const key of ['name', 'animal', 'slot', 'checkpoint', 'falls', 'highest', 'lastPlatform', 'grounded', 'won', 'finishedAt', 'rank']) p[key] = state[key];
      }
      const ids = new Set(snapshot.players.map(p => p.id)); for (const id of players.keys()) if (!ids.has(id)) this.removePlayer(id);
      for (const p of platforms) {
        Object.assign(p, samplePlatform(p.base, this.time)); p.body.setTranslation({ x: p.x, y: p.y - .24, z: p.z }, true); p.body.setRotation(rotation(p.angle), true);
      }
      for (const h of hazards) { h.angle = this.time * 1.3; h.body.setRotation(rotation(h.angle), true); }
      world.updateSceneQueries();
    },
  };
  for (const key of ['checkpoint', 'falls', 'highest', 'lastPlatform', 'grounded', 'won', 'events']) {
    Object.defineProperty(game, key, { get() { return this.self[key]; }, set(value) { this.self[key] = value; } });
  }
  game.setMembers(members, localId); return game;
}
