import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const source = process.argv[2]
if (!source) throw new Error('Pass the room reference PNG as the first argument')
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height } = info
const visited = new Uint8Array(width * height)
const queue = new Int32Array(width * height)
let head = 0
let tail = 0
function enqueue(index) {
  if (visited[index]) return
  visited[index] = 1
  const offset = index * 4
  const [r, g, b] = data.subarray(offset, offset + 3)
  if (Math.max(r, g, b) - Math.min(r, g, b) > 20) return
  queue[tail++] = index
}
// Remove only neutral pixels connected to the outside, preserving the warm outline.
for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x) }
for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1) }
while (head < tail) {
  const index = queue[head++]
  data[index * 4 + 3] = 0
  const x = index % width
  if (x > 0) enqueue(index - 1)
  if (x < width - 1) enqueue(index + 1)
  if (index >= width) enqueue(index - width)
  if (index < width * (height - 1)) enqueue(index + width)
}
const output = path.resolve('public/house/room.png')
await mkdir(path.dirname(output), { recursive: true })
await sharp(data, { raw: { width, height, channels: 4 } }).resize(1536, 1536).png().toFile(output)
console.log(`Room asset: ${output}; removed ${tail} background pixels`)
