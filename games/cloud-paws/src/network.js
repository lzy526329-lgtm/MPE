/** The embedded game never receives login tokens. Commands travel through its trusted parent. */
export function createNetwork({ onRoom, onAccount, onError, onConnection }) {
  let account = null, room = null, seq = 0, lastStateAt = 0, disconnected = false;
  const pending = new Map();
  function post(command) { window.parent.postMessage({ type: 'cloud-paws:command', command }, '*'); }
  function command(action, fields = {}) {
    if (!account) return Promise.reject(new Error('请先在桌宠「账号与同步」登录，再组队'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('联机服务暂未响应，请稍后再试')); }, 8000);
      pending.set(requestId, { resolve, reject, timer }); post({ action, ...fields, requestId });
    });
  }
  function settle(id, error) { const p = pending.get(id); if (!p) return; clearTimeout(p.timer); pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(); }
  function receive(event) {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    const data = event.data;
    if (data?.type === 'cloud-paws:account') {
      const changed = account?.id !== data.account?.id;
      account = data.account; onAccount?.(account, data.available);
      if (changed) {
        room = null; seq = 0; onRoom(null);
        for (const id of pending.keys()) settle(id, '账号已切换');
        if (account) void command('recover').catch(() => {});
      }
    }
    if (data?.type === 'cloud-paws:command-result' && !data.result?.ok) settle(data.requestId, data.result?.error?.message || '发送失败');
    if (data?.type !== 'cloud-paws:network') return;
    const m = data.event;
    if (m.type === 'cloud_paws.connection') {
      disconnected = m.status !== 'connected'; onConnection?.(m.status);
      if (!disconnected && account) { seq = 0; void command('recover').catch(onError); }
    }
    if (m.type === 'cloud_paws.state') {
      room = m.room; lastStateAt = performance.now(); disconnected = false; onRoom(room);
    }
    if (m.type === 'cloud_paws.closed') { room = null; onRoom(null); onError(m.message); }
    if (m.type === 'cloud_paws.ack') settle(m.requestId);
    if (m.type === 'cloud_paws.error') { if (pending.has(m.requestId)) settle(m.requestId, m.message); else onError(m.message); }
  }
  window.addEventListener('message', receive);
  window.parent.postMessage({ type: 'cloud-paws:hello' }, '*');
  return {
    command, get account() { return account; }, get room() { return room; },
    get stale() { return disconnected || (room?.state === 'playing' && performance.now() - lastStateAt > 2500); },
    input(input) { if (room?.state === 'playing' && !disconnected) post({ action: 'input', seq: ++seq, input }); },
    dispose() { window.removeEventListener('message', receive); for (const id of pending.keys()) settle(id, '游戏已关闭'); },
  };
}
