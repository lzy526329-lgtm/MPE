const $ = id => document.getElementById(id);
export function mountLobby({ command, getAccount, getAnimal, onOpen, onClose }) {
  let current = null, signature = '', busy = false;
  const error = message => { $('lobby-error').textContent = message || ''; };
  function memberList(root, members, selfId, race = false) {
    root.replaceChildren();
    for (const m of members) {
      const row = document.createElement('div'); row.className = 'room-member';
      const name = document.createElement('span'); name.textContent = `${m.animal === 'bunny' ? '🐰' : '🦊'} ${m.name}${m.id === selfId ? '（我）' : ''}`;
      const status = document.createElement('span');
      status.textContent = !m.connected ? '重连中' : race ? m.won ? `第 ${m.rank} 名` : `${m.lastPlatform || 0}/60` : m.ready ? '已准备' : '等待准备';
      row.append(name, status); root.append(row);
    }
  }
  function render(room, selfId) {
    current = room;
    if (!room) {
      $('lobby-entry').classList.remove('hidden'); $('lobby-room').classList.add('hidden'); $('race-roster').classList.add('hidden'); signature = ''; return;
    }
    $('lobby-entry').classList.add('hidden'); $('lobby-room').classList.remove('hidden');
    const next = JSON.stringify([room.code, room.state, room.hostId, room.members]);
    if (signature !== next) {
      signature = next; $('room-number').textContent = room.code; $('room-count').textContent = `${room.members.length}/5 人`;
      memberList($('room-members'), room.members, selfId);
      const ready = room.members.find(m => m.id === selfId)?.ready;
      $('ready-room').firstElementChild.textContent = ready ? '取消准备' : '准备';
      $('start-room').classList.toggle('hidden', room.hostId !== selfId);
      $('start-room').disabled = room.members.length < 2 || !room.members.every(m => m.ready && m.connected);
      $('room-note').textContent = room.hostId === selfId ? '所有人准备后，一起出发' : '准备好后等待房主开始';
    }
    $('race-roster').classList.toggle('hidden', room.state === 'waiting');
    if (room.state !== 'waiting') {
      $('race-status').textContent = room.state === 'countdown' ? `${Math.ceil(room.countdown)} 秒后出发` : `房间 ${room.code} · ${room.members.length}/5`;
      memberList($('race-members'), room.snapshot.players.map(p => ({ ...p, connected: room.members.find(m => m.id === p.id)?.connected })).sort((a,b) => (a.rank || 99) - (b.rank || 99) || b.lastPlatform - a.lastPlatform), selfId, true);
    }
  }
  async function act(action, fields) {
    if (busy) return; busy = true; error('');
    try { await command(action, fields); } catch (e) { error(e.message); } finally { busy = false; }
  }
  $('multiplayer').addEventListener('click', () => { error(''); $('lobby').classList.remove('hidden'); onOpen(); $('create-room').focus(); });
  $('close-lobby').addEventListener('click', () => { $('lobby').classList.add('hidden'); onClose(); });
  $('create-room').addEventListener('click', () => act('create', { animal: getAnimal() }));
  $('join-room').addEventListener('click', () => act('join', { code: $('room-code').value.trim(), animal: getAnimal() }));
  $('room-code').addEventListener('keydown', e => { if (e.key === 'Enter') void act('join', { code: $('room-code').value.trim(), animal: getAnimal() }); });
  $('ready-room').addEventListener('click', () => act('ready', { ready: !current?.members.find(m => m.id === getAccount()?.id)?.ready }));
  $('start-room').addEventListener('click', () => act('start'));
  $('leave-room').addEventListener('click', () => act('leave'));
  return { render, error, setAccount(account, available) { $('lobby-account').textContent = account ? `以 ${account.name} 加入 · 免费同场闯关` : available ? '请先在桌宠「账号与同步」登录' : '请从桌宠打开并登录后组队'; } };
}
