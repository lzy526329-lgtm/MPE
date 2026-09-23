const { app } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

if (app.isPackaged || process.env.MPT_BATTLE_TEST !== '1') {
  app.exit(1)
} else {
  const children = new Set()
  const stopChildren = () => { for (const child of children) child.kill() }
  app.on('before-quit', stopChildren)
  process.on('exit', stopChildren)
  process.on('SIGINT', () => app.quit())
  process.on('SIGTERM', () => app.quit())
  app.whenReady().then(() => {
    for (const profile of ['A', 'B']) {
      const env = { ...process.env, MPT_TEST_PROFILE: profile }
      delete env.ELECTRON_RUN_AS_NODE
      const child = spawn(process.execPath, [path.resolve(__dirname, '..')], { env, stdio: 'inherit' })
      children.add(child)
      child.once('error', error => { console.error(`[battle-test] ${profile}:`, error.message); app.exit(1) })
      child.once('exit', code => {
        children.delete(child)
        if (code) console.error(`[battle-test] ${profile} exited with code ${code}`)
        if (!children.size) app.quit()
      })
    }
  })
}
