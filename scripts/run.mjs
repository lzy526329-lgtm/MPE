import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('缺少要执行的命令')

const executable = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? `${command}.cmd` : command,
)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(executable, args, {
  stdio: 'inherit',
  env,
  windowsHide: true,
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
child.on('close', (code) => process.exit(code ?? 1))
