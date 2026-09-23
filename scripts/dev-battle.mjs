import process from 'node:process'
import { createServer } from 'vite'

// Both players must use this local backend, including when the shell has a production URL set.
process.env.GAME_API_BASE_URL = 'http://localhost:8088'
process.env.MPT_BATTLE_TEST = '1'
delete process.env.ELECTRON_RUN_AS_NODE

try {
  const response = await fetch('http://localhost:8088/api/game/auth/me', { signal: AbortSignal.timeout(3000) })
  if (response.status !== 401) throw new Error(`本地账号服务响应异常：${response.status}`)
  const server = await createServer({ server: { port: 5173, strictPort: true } })
  await server.listen()
  server.printUrls()
  console.log('正在打开测试 A / 测试 B，请分别登录两个不同账号。关闭两个窗口即可停止。')
} catch (error) {
  console.error('双开启动失败。请确认本地后端已在 8088 端口启动，并先停止普通开发模式。')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
