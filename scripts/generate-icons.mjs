import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const buildDirectory = path.join(root, 'build')
const source = await readFile(path.join(buildDirectory, 'icon.svg'))
const pngPath = path.join(buildDirectory, 'icon.png')

await sharp(source).resize(1024, 1024).png().toFile(pngPath)
await writeFile(path.join(buildDirectory, 'icon.ico'), await pngToIco(pngPath))

if (process.platform === 'darwin') {
  const iconsetPath = path.join(buildDirectory, 'icon.iconset')
  await rm(iconsetPath, { recursive: true, force: true })
  await mkdir(iconsetPath)

  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(source)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsetPath, `icon_${size}x${size}.png`))
    await sharp(source)
      .resize(size * 2, size * 2)
      .png()
      .toFile(path.join(iconsetPath, `icon_${size}x${size}@2x.png`))
  }

  await new Promise((resolve, reject) => {
    const child = spawn('iconutil', [
      '--convert',
      'icns',
      '--output',
      path.join(buildDirectory, 'icon.icns'),
      iconsetPath,
    ], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error('iconutil failed')))
  })

  await rm(iconsetPath, { recursive: true, force: true })
}

console.log('应用图标已生成')
