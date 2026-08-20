import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('缺少要执行的命令')

const isWin = process.platform === 'win32'
const binDir = path.resolve('node_modules', '.bin')
const candidates = isWin
  ? [`${command}.cmd`, `${command}.ps1`, command]
  : [command]

const executable = candidates
  .map((name) => path.join(binDir, name))
  .find((file) => fs.existsSync(file))

if (!executable) {
  console.error(`找不到本地命令: ${command}`)
  console.error(`请先执行 npm install（期望路径：node_modules/.bin/${command}）`)
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// Windows 下直接 spawn .cmd 会 EINVAL，需要 shell
const child = spawn(executable, args, {
  stdio: 'inherit',
  env,
  windowsHide: true,
  shell: isWin,
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
child.on('close', (code) => process.exit(code ?? 1))
