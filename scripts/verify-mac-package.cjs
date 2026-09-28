// 在打包后的 Electron 中执行，确保检查的是安装包内的依赖。
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')

async function main() {
  const [expectedArch, archive] = process.argv.slice(2)
  assert.equal(process.platform, 'darwin')
  assert.equal(process.arch, expectedArch)
  const requireApp = createRequire(path.resolve(archive, 'package.json'))
  const sharp = requireApp('sharp')
  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffff' } }).png().toBuffer()
  assert.ok(png.length > 0)
  const { createCanvas } = requireApp('@napi-rs/canvas')
  assert.ok(createCanvas(1, 1).toBuffer('image/png').length > 0)
  const binary = requireApp('7zip-bin').path7za.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
  fs.chmodSync(binary, 0o755)
  execFileSync(binary, ['i'], { stdio: 'pipe' })
  console.log(`Packaged ${expectedArch} Electron, Sharp, Canvas and 7-Zip verified`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
