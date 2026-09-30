import RAPIER from '@dimforge/rapier3d-compat';
import { LEVEL, CORE, SUMMIT, containsPlatform, samplePlatform, platformLocalPoint, platformWorldPoint, landingPoint } from './level.js';
let initialized;
const rotation = angle => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });

export async function createGame() {
  initialized ??= RAPIER.init();
  await initialized;
  const world = new RAPIER.World({ x: 0, y: -22, z: 0 });
  world.timestep = 1 / 60;
  const platformByCollider = new Map();
  const platforms = LEVEL.map(p => {
    const dynamic = p.moving || p.rotating;
    const description = dynamic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
    const body = world.createRigidBody(description.setTranslation(p.x, p.y - 0.24, p.z).setRotation(rotation(p.angle)));
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(p.w / 2, 0.24, p.d / 2).setFriction(0), body);
    const platform = { ...p, base: p, body, collider };
    platformByCollider.set(collider.handle, platform);
    return platform;
  });
  for (const core of CORE) {
    const terrain = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(core.x, core.y, core.z));
    world.createCollider(RAPIER.ColliderDesc.cylinder(core.height / 2, core.radius), terrain);
  }
  const hazards = platforms.filter(p => p.hazard).map(p => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + 0.4, p.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.15, 0.15).setFriction(0), body);
    return { body, platform: p, angle: 0 };
  });
  const start = platforms[0];
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y + 0.65, start.z).lockRotations().setCcdEnabled(true));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.3, 0.3).setFriction(0).setRestitution(0).setMass(1), body);
  let jumpHeld = false, buffer = 0, coyote = 0;

  const game = {
    world, body, platforms, hazards, collected: new Set(), checkpoint: 0,
    elapsed: 0, time: 0, falls: 0, won: false, running: false, grounded: false,
    highest: 0, lastPlatform: 0, events: [],
    get position() { return body.translation(); },
    get nextPlatform() { return platforms[Math.min(this.lastPlatform + 1, platforms.length - 1)]; },
    start() { this.running = true; },
    pause() { this.running = false; },
    respawn(count = true) {
      const p = platforms[this.checkpoint];
      body.setTranslation({ x: p.x, y: p.y + 0.65, z: p.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (count) this.falls++;
      this.lastPlatform = this.checkpoint;
      this.grounded = false;
      buffer = 0; coyote = 0;
      this.events.push('respawn');
    },
    reset() {
      this.collected.clear(); this.checkpoint = 0; this.elapsed = 0; this.time = 0;
      this.falls = 0; this.won = false; this.running = false; this.highest = 0;
      this.lastPlatform = 0; this.events = []; jumpHeld = false;
      for (const p of platforms) {
        Object.assign(p, samplePlatform(p.base, 0));
        p.body.setTranslation({ x: p.x, y: p.y - 0.24, z: p.z }, true);
        p.body.setRotation(rotation(p.angle), true);
        if (p.moving || p.rotating) {
          p.body.setNextKinematicTranslation({ x: p.x, y: p.y - 0.24, z: p.z });
          p.body.setNextKinematicRotation(rotation(p.angle));
        }
      }
      this.respawn(false); this.events = [];
    },
    cameraDistance(origin, direction, distance) {
      const hit = world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, collider, body);
      return hit ? Math.max(1.4, hit.toi - 0.35) : distance;
    },
    step(input = {}, dt = 1 / 60) {
      if (!this.running || this.won) return;
      dt = Math.min(dt, 1 / 30);
      world.timestep = dt; this.elapsed += dt; this.time += dt;
      const position = body.translation();
      const ray = new RAPIER.Ray(position, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 0.71, true, undefined, undefined, collider, body);
      this.grounded = Boolean(hit) && body.linvel().y < 1;
      const support = this.grounded && hit ? platformByCollider.get(hit.collider.handle) : undefined;
      // Carry a standing rider through both translation and rotation. Input remains relative to the surface.
      for (const p of platforms) {
        if (!p.moving && !p.rotating) continue;
        const local = support === p ? platformLocalPoint(p, body.translation()) : null;
        Object.assign(p, samplePlatform(p.base, this.time));
        if (local) {
          const carried = platformWorldPoint(p, local);
          body.setTranslation({ ...carried, y: body.translation().y }, true);
        }
        p.body.setNextKinematicTranslation({ x: p.x, y: p.y - 0.24, z: p.z });
        p.body.setNextKinematicRotation(rotation(p.angle));
      }
      for (const h of hazards) {
        h.angle = this.time * 1.3;
        h.body.setNextKinematicRotation(rotation(h.angle));
      }
      if (this.grounded) coyote = 0.1;
      else coyote = Math.max(0, coyote - dt);
      if (input.jump && !jumpHeld) buffer = 0.13;
      else buffer = Math.max(0, buffer - dt);
      jumpHeld = Boolean(input.jump);
      const length = Math.hypot(input.x || 0, input.z || 0);
      const speed = input.sprint ? 8 : 6.6;
      const targetX = length ? input.x / Math.max(1, length) * speed : 0;
      const targetZ = length ? input.z / Math.max(1, length) * speed : 0;
      const velocity = body.linvel();
      const blend = 1 - Math.exp(-(this.grounded ? 24 : 11) * dt);
      let vy = velocity.y;
      if (buffer > 0 && coyote > 0) {
        vy = 10.4; buffer = 0; coyote = 0; this.grounded = false;
        this.events.push('jump');
      }
      body.setLinvel({ x: velocity.x + (targetX - velocity.x) * blend, y: vy, z: velocity.z + (targetZ - velocity.z) * blend }, true);
      world.step();
      const now = body.translation();
      this.highest = Math.max(this.highest, Math.min(SUMMIT.y, now.y - 0.6));
      for (const p of platforms) {
        if (!containsPlatform(p, now, 0.06) || now.y < p.y + 0.48 || now.y > p.y + 0.74 || body.linvel().y >= 1) continue;
        this.lastPlatform = p.id;
        if (p.checkpoint && p.id > this.checkpoint) {
          this.checkpoint = p.id; this.events.push('checkpoint');
        }
        const star = landingPoint(p);
        if (p.star && !this.collected.has(p.id) && Math.hypot(now.x - star.x, now.z - star.z) < 1.45) {
          this.collected.add(p.id); this.events.push('star');
        }
        if (p.kind === 'summit') { this.won = true; this.running = false; this.events.push('win'); }
      }
      if (now.y < platforms[this.checkpoint].y - 9) this.respawn();
    },
  };
  world.step();
  return game;
}
