import { randomInt } from 'node:crypto';
import { createGame } from '../src/game.js';
export const PROTOCOL = 1;
const fail = message => { throw new Error(message); };
const ALLOWED = new Set(['create', 'join', 'ready', 'start', 'leave', 'input', 'recover', 'respawn', 'rematch']);
export function createCloudPawsRooms({ sendToUser, clock = Date.now, maxRooms = 64 } = {}) {
  const rooms = new Map(), membership = new Map(), limits = new Map();
  let serial = Promise.resolve(), disposed = false;
  const send = (id, data) => sendToUser(id, { ...data, protocol: PROTOCOL });
  const view = room => ({ code: room.code, hostId: room.hostId, state: room.state, countdown: room.countdown,
    members: [...room.members.values()].map(({ id, name, animal, ready, connected, slot }) => ({ id, name, animal, ready, connected, slot })), snapshot: room.game.snapshot() });
  const publish = room => { const data = { type: 'cloud_paws.state', room: view(room) }; for (const m of room.members.values()) if (m.connected) send(m.id, data); };
  function closeRoom(room, reason) {
    for (const id of room.members.keys()) { membership.delete(id); send(id, { type: 'cloud_paws.closed', message: reason }); }
    rooms.delete(room.code); room.game.world.free();
  }
  function leave(id) {
    const room = rooms.get(membership.get(id)); if (!room) return;
    room.members.delete(id); membership.delete(id); room.game.removePlayer(id);
    if (!room.members.size) { rooms.delete(room.code); room.game.world.free(); return; }
    if (room.hostId === id) room.hostId = [...room.members.values()].find(m => m.connected)?.id || room.members.keys().next().value;
    if (room.state === 'countdown') { room.state = 'waiting'; room.countdown = 3; room.game.pause(); }
    if (room.state === 'waiting') { [...room.members.values()].forEach((m, i) => { m.slot = i; }); room.game.setMembers([...room.members.values()]); }
    publish(room);
  }
  function rateLimit(id, input) {
    const now = clock(), key = `${id}:${input ? 'input' : 'action'}`;
    let rate = limits.get(key); if (!rate || now - rate.at >= 1000) limits.set(key, rate = { at: now, count: 0 });
    if (++rate.count > (input ? 90 : 20)) fail('操作太快，请稍后再试');
  }
  async function process(id, message) {
    id = String(id);
    const action = String(message.type || '').replace(/^cloud_paws\./, '');
    if (!ALLOWED.has(action)) fail('不支持的房间操作');
    rateLimit(id, action === 'input');
    if (action !== 'leave' && message.protocol !== PROTOCOL) fail('游戏版本不一致，请更新后重试');
    let room = rooms.get(membership.get(id));
    if (action === 'recover') {
      if (room) {
        const m = room.members.get(id); m.connected = true; m.disconnectedAt = null; m.input = {}; m.inputAt = clock(); m.seq = -1;
        room.game.players.get(id)?.body.setEnabled(!room.game.players.get(id)?.won); publish(room);
      } else send(id, { type: 'cloud_paws.state', room: null });
      return;
    }
    if (action === 'leave') { leave(id); send(id, { type: 'cloud_paws.state', room: null }); return; }
    if (action === 'create' || action === 'join') {
      if (room) { publish(room); return; }
      const name = typeof message.name === 'string' ? message.name.trim().slice(0, 24) : '';
      const member = { id, name: name || `玩家${id.slice(-4)}`, animal: message.animal === 'bunny' ? 'bunny' : 'fox', ready: false,
        connected: true, disconnectedAt: null, input: {}, inputAt: 0, seq: -1, respawnAt: -Infinity };
      if (action === 'create') {
        if (rooms.size >= maxRooms) fail('房间已满，请稍后再试');
        let code; do { code = String(randomInt(100000, 1000000)); } while (rooms.has(code));
        const game = await createGame({ members: [member], localId: id });
        if (disposed) { game.world.free(); return; }
        room = { code, hostId: id, state: 'waiting', countdown: 3, members: new Map(), game, createdAt: clock(), frames: 0 };
        rooms.set(code, room);
      } else {
        if (typeof message.code !== 'string' || !/^\d{6}$/.test(message.code)) fail('请输入 6 位房间码');
        room = rooms.get(message.code); if (!room) fail('房间不存在或已结束');
        if (room.state !== 'waiting') fail('这一局已经开始，请等下一局');
        if (room.members.size >= 5) fail('房间最多 5 人，已经满了');
      }
      member.slot = room.members.size; room.members.set(id, member); membership.set(id, room.code);
      room.game.setMembers([...room.members.values()]); publish(room); return;
    }
    if (!room) fail('请先创建或加入房间');
    const member = room.members.get(id);
    if (!member.connected) fail('连接已断开，请重新加入');
    if (action === 'input') {
      if (!Number.isSafeInteger(message.seq) || message.seq < 0 || message.seq <= member.seq) return;
      const i = message.input;
      if (!i || !Number.isFinite(i.x) || !Number.isFinite(i.z) || Math.abs(i.x) > 1.01 || Math.abs(i.z) > 1.01 || typeof i.jump !== 'boolean' || typeof i.sprint !== 'boolean') fail('移动指令无效');
      member.seq = message.seq; member.inputAt = clock(); member.input = { x: i.x, z: i.z, jump: i.jump, sprint: i.sprint }; return;
    }
    if (action === 'ready') { if (room.state !== 'waiting') fail('当前不能修改准备状态'); member.ready = message.ready === true; }
    if (action === 'start') {
      if (room.hostId !== id) fail('只有房主可以开始');
      if (room.state !== 'waiting') fail('比赛已经开始');
      if (room.members.size < 2 || ![...room.members.values()].every(m => m.ready && m.connected)) fail('至少 2 人，且所有玩家准备后才能开始');
      room.state = 'countdown'; room.countdown = 3; room.game.reset();
    }
    if (action === 'respawn') {
      if (room.state !== 'playing' || clock() - member.respawnAt < 1000) return;
      member.respawnAt = clock(); room.game.respawn(true, id);
    }
    if (action === 'rematch') {
      if (room.hostId !== id || room.state !== 'finished') fail('比赛结束后由房主再开一局');
      room.state = 'waiting'; for (const m of room.members.values()) { m.ready = false; m.input = {}; }
      room.game.reset();
    }
    publish(room);
  }
  return {
    // Serialize membership mutations so simultaneous joins cannot overfill a room.
    handle(userId, message) {
      const task = serial.then(async () => {
        if (disposed) return;
        try {
          await process(userId, message);
          if (message.requestId) send(userId, { type: 'cloud_paws.ack', requestId: String(message.requestId).slice(0, 80) });
        } catch (e) { send(userId, { type: 'cloud_paws.error', requestId: String(message.requestId || '').slice(0, 80), message: e.message }); }
      });
      serial = task.catch(() => {}); return task;
    },
    disconnect(userId) {
      const id = String(userId), room = rooms.get(membership.get(id)); if (!room) return;
      const m = room.members.get(id); m.connected = false; m.input = {}; m.disconnectedAt = clock();
      room.game.players.get(id)?.body.setEnabled(false);
      if (room.state === 'countdown') { room.state = 'waiting'; room.countdown = 3; }
      publish(room);
    },
    tick(dt = 1 / 60) {
      if (disposed) return;
      for (const [key, rate] of limits) if (clock() - rate.at > 60000) limits.delete(key);
      for (const room of rooms.values()) {
        if (clock() - room.createdAt > (room.state === 'waiting' ? 600000 : 3600000)) { closeRoom(room, '房间已到期，请重新组队'); continue; }
        for (const m of [...room.members.values()]) if (!m.connected && clock() - m.disconnectedAt >= 20000) leave(m.id);
        if (!rooms.has(room.code)) continue;
        if (room.state === 'countdown') {
          room.countdown = Math.max(0, room.countdown - dt);
          if (room.countdown <= 0) { room.state = 'playing'; room.game.start(); }
        }
        if (room.state === 'playing') {
          const inputs = new Map([...room.members.values()].map(m => [m.id, m.connected && clock() - m.inputAt < 300 ? m.input : {}]));
          room.game.stepPlayers(inputs, dt);
          for (const p of room.game.players.values()) p.events.length = 0;
          if ([...room.game.players.values()].every(p => p.won)) room.state = 'finished';
        }
        if (++room.frames % 3 === 0 && room.state !== 'waiting') publish(room);
      }
    },
    inspect: code => { const r = rooms.get(code); return r ? view(r) : null; },
    dispose() { disposed = true; for (const room of [...rooms.values()]) closeRoom(room, '联机服务已重启，请重新组队'); limits.clear(); },
  };
}
