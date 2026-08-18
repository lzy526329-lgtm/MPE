import sharp from 'sharp'

export type OutputFormat = 'auto' | 'png' | 'jpeg' | 'webp' | 'avif'

export interface CompressRequest {
  data: Uint8Array
  format: OutputFormat
}

export interface CompressResult {
  data: Uint8Array
  size: number
  format: string
  extension: string
  width: number
  height: number
  strategy: string
  keptOriginal: boolean
}

/**
 * 有损压缩的起始质量。与 TinyPNG 的思路一致：固定在“肉眼几乎无差别”的区间，
 * 而不是让用户手动调质量。
 */
const BASE_QUALITY: Record<Exclude<OutputFormat, 'auto'>, number> = {
  png: 72,
  jpeg: 76,
  webp: 80,
  avif: 55,
}

const EXTENSION: Record<Exclude<OutputFormat, 'auto'>, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  avif: 'avif',
}

const MIME: Record<Exclude<OutputFormat, 'auto'>, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
}

type Encoded = { buffer: Buffer; strategy: string }

/** PNG：先做调色板量化（libimagequant），再和纯无损优化结果比体积，取小的那个。 */
async function encodePng(input: Buffer, quality: number): Promise<Encoded[]> {
  const quantised = await sharp(input)
    .rotate()
    .png({ palette: true, quality, dither: 1, effort: 10, compressionLevel: 9 })
    .toBuffer()

  const lossless = await sharp(input)
    .rotate()
    .png({ palette: false, effort: 10, compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()

  return [
    { buffer: quantised, strategy: `调色板量化 q${quality}` },
    { buffer: lossless, strategy: '无损重压缩' },
  ]
}

async function encodeLossy(
  input: Buffer,
  format: Exclude<OutputFormat, 'auto' | 'png'>,
  quality: number,
): Promise<Encoded> {
  const pipeline = sharp(input).rotate()

  if (format === 'jpeg') {
    return {
      buffer: await pipeline
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer(),
      strategy: `mozjpeg q${quality}`,
    }
  }

  if (format === 'webp') {
    return {
      buffer: await pipeline.webp({ quality, effort: 6, smartSubsample: true }).toBuffer(),
      strategy: `WebP q${quality}`,
    }
  }

  return {
    buffer: await pipeline.avif({ quality, effort: 4, chromaSubsampling: '4:2:0' }).toBuffer(),
    strategy: `AVIF q${quality}`,
  }
}

export async function compressImage({ data, format }: CompressRequest): Promise<CompressResult> {
  const input = Buffer.from(data)
  const metadata = await sharp(input).metadata()

  const detected: string = metadata.format ?? 'png'

  // auto：沿用原格式（PNG 之外无法无损承载的都归到自身格式，其余按 PNG 处理）
  const resolveTarget = (): Exclude<OutputFormat, 'auto'> => {
    if (format !== 'auto') return format
    if (detected === 'jpeg' || detected === 'webp' || detected === 'avif') return detected
    return 'png'
  }

  const target = resolveTarget()

  const baseQuality = BASE_QUALITY[target]
  // 体积没明显下降时逐级降低质量，避免出现“压完更大”
  const qualitySteps = [baseQuality, baseQuality - 12, baseQuality - 24].filter((q) => q >= 40)

  let best: Encoded | null = null
  for (const quality of qualitySteps) {
    const candidates =
      target === 'png' ? await encodePng(input, quality) : [await encodeLossy(input, target, quality)]

    for (const candidate of candidates) {
      if (!best || candidate.buffer.length < best.buffer.length) best = candidate
    }

    if (best && best.buffer.length <= input.length * 0.85) break
  }

  if (!best) throw new Error('encode failed')

  // 兜底：压缩结果不比原图小就保留原图，避免“越压越大”
  const keptOriginal = best.buffer.length >= input.length
  const output = keptOriginal ? input : best.buffer
  const outputMeta = keptOriginal ? metadata : await sharp(output).metadata()

  return {
    data: new Uint8Array(output),
    size: output.length,
    format: keptOriginal ? `image/${detected}` : MIME[target],
    extension: keptOriginal ? detected : EXTENSION[target],
    width: outputMeta.width ?? 0,
    height: outputMeta.height ?? 0,
    strategy: keptOriginal ? '保留原图' : best.strategy,
    keptOriginal,
  }
}
