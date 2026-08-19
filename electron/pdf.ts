import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const require = createRequire(import.meta.url)
const { createCanvas } = require('@napi-rs/canvas') as {
  createCanvas: (width: number, height: number) => {
    getContext: (kind: '2d') => unknown
    encode: (format: 'png' | 'jpeg', quality?: number) => Promise<Buffer>
  }
}

export interface PdfFileInfo {
  path: string
  name: string
  size: number
  defaultDestination: string
  pageCount?: number
}

export interface MergePdfRequest {
  sourcePaths: string[]
  outputPath: string
}

export interface SplitPdfRequest {
  sourcePath: string
  outputDirectory: string
  ranges: string
}

export interface ImagesToPdfRequest {
  sourcePaths: string[]
  outputPath: string
}

export interface PdfOperationResult {
  outputPath: string
  outputSize: number
}

export interface PdfToImagesRequest {
  sourcePath: string
  outputDirectory: string
  format: 'png' | 'jpeg'
  scale?: number
}

export interface PdfToImagesResult {
  outputDirectory: string
  files: Array<{ path: string; name: string; page: number; size: number }>
}

export interface CompressPdfRequest {
  sourcePath: string
  outputPath: string
  quality: number
  scale?: number
}

export interface ExtractPdfImagesRequest {
  sourcePath: string
  outputDirectory: string
}

export interface ExtractPdfImagesResult {
  outputDirectory: string
  files: Array<{ path: string; name: string; page: number; size: number }>
}

export interface WatermarkPdfRequest {
  sourcePath: string
  outputPath: string
  text: string
  opacity?: number
  fontSize?: number
}

export interface SplitPdfResult {
  outputDirectory: string
  files: Array<{ path: string; name: string; pageRange: string; size: number }>
}

function safeName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+|\.+$/g, '')
  return cleaned || '文件'
}

async function ensureParentDirectory(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
}

type PdfJsPage = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfJsDocument>>['getPage']>>

async function loadPdfJsDocument(filePath: string) {
  const bytes = await readFile(filePath)
  return pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
  } as never).promise
}

async function renderPdfPage(page: PdfJsPage, scale: number) {
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  await page.render({
    canvas: canvas as never,
    canvasContext: context as never,
    viewport,
  } as never).promise
  return { canvas, viewport }
}

async function pageObjectToPngBuffer(image: {
  width?: number
  height?: number
  data?: Uint8ClampedArray | Uint8Array
  kind?: number
}) {
  if (!image.width || !image.height || !image.data) return null
  return sharp(Buffer.from(image.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  }).png().toBuffer()
}

function loadPageObject(page: PdfJsPage, objectId: string) {
  return new Promise<{
    width?: number
    height?: number
    data?: Uint8ClampedArray | Uint8Array
    kind?: number
  } | null>((resolve) => {
    try {
      page.objs.get(objectId, (object: unknown) => {
        resolve((object as {
          width?: number
          height?: number
          data?: Uint8ClampedArray | Uint8Array
          kind?: number
        }) ?? null)
      })
    } catch {
      resolve(null)
    }
  })
}

export async function inspectPdf(pdfPath: string): Promise<PdfFileInfo> {
  const fileStat = await stat(pdfPath)
  if (!fileStat.isFile()) throw new Error('所选内容不是文件')
  if (!pdfPath.toLowerCase().endsWith('.pdf')) throw new Error('请选择 PDF 文件')

  const bytes = await readFile(pdfPath)
  const pdf = await PDFDocument.load(bytes)
  return {
    path: pdfPath,
    name: path.basename(pdfPath),
    size: fileStat.size,
    defaultDestination: path.dirname(pdfPath),
    pageCount: pdf.getPageCount(),
  }
}

export async function inspectImageSource(imagePath: string): Promise<PdfFileInfo> {
  const fileStat = await stat(imagePath)
  if (!fileStat.isFile()) throw new Error('所选内容不是文件')
  const extension = path.extname(imagePath).toLowerCase()
  if (!['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(extension)) {
    throw new Error('请选择 JPG、PNG、WebP 或 AVIF 图片')
  }
  return {
    path: imagePath,
    name: path.basename(imagePath),
    size: fileStat.size,
    defaultDestination: path.dirname(imagePath),
  }
}

export async function mergePdfFiles(request: MergePdfRequest): Promise<PdfOperationResult> {
  if (request.sourcePaths.length < 2) throw new Error('至少选择两个 PDF 文件')

  const merged = await PDFDocument.create()
  for (const sourcePath of request.sourcePaths) {
    const bytes = await readFile(sourcePath)
    const source = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(source, source.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }

  await ensureParentDirectory(request.outputPath)
  const output = await merged.save()
  await writeFile(request.outputPath, output)
  return {
    outputPath: request.outputPath,
    outputSize: (await stat(request.outputPath)).size,
  }
}

function parseRanges(input: string, maxPage: number) {
  const normalized = input.replace(/，/g, ',').trim()
  if (!normalized) throw new Error('请输入页码范围')

  const segments = normalized.split(',').map((item) => item.trim()).filter(Boolean)
  const result: Array<{ start: number; end: number; label: string }> = []

  for (const segment of segments) {
    const match = segment.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) throw new Error(`无法识别页码范围：${segment}`)
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (start < 1 || end < 1 || start > maxPage || end > maxPage || start > end) {
      throw new Error(`页码超出范围：${segment}`)
    }
    result.push({ start, end, label: start === end ? `${start}` : `${start}-${end}` })
  }

  return result
}

export async function splitPdfFile(request: SplitPdfRequest): Promise<SplitPdfResult> {
  const bytes = await readFile(request.sourcePath)
  const source = await PDFDocument.load(bytes)
  const pageCount = source.getPageCount()
  const ranges = parseRanges(request.ranges, pageCount)
  const baseName = safeName(path.basename(request.sourcePath, '.pdf'))

  await mkdir(request.outputDirectory, { recursive: true })

  const files: SplitPdfResult['files'] = []
  for (const range of ranges) {
    const output = await PDFDocument.create()
    const indices = Array.from(
      { length: range.end - range.start + 1 },
      (_value, index) => range.start - 1 + index,
    )
    const pages = await output.copyPages(source, indices)
    for (const page of pages) output.addPage(page)

    const outputPath = path.join(request.outputDirectory, `${baseName}-${range.label}.pdf`)
    await writeFile(outputPath, await output.save())
    files.push({
      path: outputPath,
      name: path.basename(outputPath),
      pageRange: range.label,
      size: (await stat(outputPath)).size,
    })
  }

  return {
    outputDirectory: request.outputDirectory,
    files,
  }
}

async function normalizeImageForPdf(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  const source = await readFile(filePath)

  if (extension === '.jpg' || extension === '.jpeg') {
    const meta = await sharp(source).metadata()
    return {
      format: 'jpg' as const,
      data: source,
      width: meta.width ?? 1000,
      height: meta.height ?? 1000,
    }
  }

  const png = await sharp(source).png().toBuffer()
  const meta = await sharp(png).metadata()
  return {
    format: 'png' as const,
    data: png,
    width: meta.width ?? 1000,
    height: meta.height ?? 1000,
  }
}

export async function imagesToPdf(request: ImagesToPdfRequest): Promise<PdfOperationResult> {
  if (request.sourcePaths.length === 0) throw new Error('请至少选择一张图片')

  const pdf = await PDFDocument.create()
  for (const sourcePath of request.sourcePaths) {
    const image = await normalizeImageForPdf(sourcePath)
    const page = pdf.addPage([image.width, image.height])
    const embedded = image.format === 'jpg'
      ? await pdf.embedJpg(image.data)
      : await pdf.embedPng(image.data)

    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    })
  }

  await ensureParentDirectory(request.outputPath)
  await writeFile(request.outputPath, await pdf.save())
  return {
    outputPath: request.outputPath,
    outputSize: (await stat(request.outputPath)).size,
  }
}

export async function pdfToImages(request: PdfToImagesRequest): Promise<PdfToImagesResult> {
  const document = await loadPdfJsDocument(request.sourcePath)
  const scale = request.scale ?? 2
  const baseName = safeName(path.basename(request.sourcePath, '.pdf'))

  await mkdir(request.outputDirectory, { recursive: true })

  const files: PdfToImagesResult['files'] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const { canvas } = await renderPdfPage(page, scale)
    const extension = request.format === 'png' ? 'png' : 'jpg'
    const outputPath = path.join(
      request.outputDirectory,
      `${baseName}-page-${String(pageNumber).padStart(3, '0')}.${extension}`,
    )
    const buffer = request.format === 'png'
      ? await canvas.encode('png')
      : await canvas.encode('jpeg', 90)
    await writeFile(outputPath, buffer)
    files.push({
      path: outputPath,
      name: path.basename(outputPath),
      page: pageNumber,
      size: (await stat(outputPath)).size,
    })
  }

  return {
    outputDirectory: request.outputDirectory,
    files,
  }
}

export async function compressPdfFile(request: CompressPdfRequest): Promise<PdfOperationResult> {
  const document = await loadPdfJsDocument(request.sourcePath)
  const scale = request.scale ?? 1.5
  const quality = Math.max(35, Math.min(90, request.quality))
  const pdf = await PDFDocument.create()

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const { canvas, viewport } = await renderPdfPage(page, scale)
    const jpeg = await canvas.encode('jpeg', quality)
    const embedded = await pdf.embedJpg(jpeg)
    const outPage = pdf.addPage([viewport.width, viewport.height])
    outPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    })
  }

  await ensureParentDirectory(request.outputPath)
  await writeFile(request.outputPath, await pdf.save())
  return {
    outputPath: request.outputPath,
    outputSize: (await stat(request.outputPath)).size,
  }
}

export async function extractPdfImages(
  request: ExtractPdfImagesRequest,
): Promise<ExtractPdfImagesResult> {
  const document = await loadPdfJsDocument(request.sourcePath)
  const baseName = safeName(path.basename(request.sourcePath, '.pdf'))
  await mkdir(request.outputDirectory, { recursive: true })

  const files: ExtractPdfImagesResult['files'] = []
  let imageIndex = 1

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const operators = await page.getOperatorList()
    const ops = pdfjs.OPS as Record<string, number | undefined>

    for (let i = 0; i < operators.fnArray.length; i += 1) {
      const fn = operators.fnArray[i]
      const args = operators.argsArray[i] as unknown[]
      let png: Buffer | null = null

      if (fn === ops.paintInlineImageXObject) {
        png = await pageObjectToPngBuffer(args[0] as {
          width?: number
          height?: number
          data?: Uint8ClampedArray | Uint8Array
          kind?: number
        })
      } else if (fn === ops.paintImageXObject || fn === ops.paintJpegXObject) {
        const objectId = String(args[0] ?? '')
        const image = await loadPageObject(page, objectId)
        if (image) png = await pageObjectToPngBuffer(image)
      }

      if (!png) continue

      const outputPath = path.join(
        request.outputDirectory,
        `${baseName}-page-${String(pageNumber).padStart(3, '0')}-img-${String(imageIndex).padStart(3, '0')}.png`,
      )
      await writeFile(outputPath, png)
      files.push({
        path: outputPath,
        name: path.basename(outputPath),
        page: pageNumber,
        size: (await stat(outputPath)).size,
      })
      imageIndex += 1
    }
  }

  return {
    outputDirectory: request.outputDirectory,
    files,
  }
}

type Canvas2DContext = {
  font: string
  textAlign: string
  textBaseline: string
  globalAlpha: number
  fillStyle: string
  translate: (x: number, y: number) => void
  rotate: (angle: number) => void
  fillText: (text: string, x: number, y: number) => void
  measureText: (text: string) => { width: number }
  clearRect: (x: number, y: number, w: number, h: number) => void
}

const WATERMARK_FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif'

async function createWatermarkPng(text: string, fontSize: number, opacity: number) {
  const measureCanvas = createCanvas(10, 10)
  const measureCtx = measureCanvas.getContext('2d') as Canvas2DContext
  measureCtx.font = `bold ${fontSize}px ${WATERMARK_FONT_FAMILY}`
  const textWidth = measureCtx.measureText(text).width
  const pad = Math.max(32, fontSize)
  const width = Math.ceil(textWidth + pad * 2)
  const height = Math.ceil(fontSize * 2 + pad)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d') as Canvas2DContext
  ctx.clearRect(0, 0, width, height)
  ctx.globalAlpha = opacity
  ctx.fillStyle = '#6b6b6b'
  ctx.font = `bold ${fontSize}px ${WATERMARK_FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(width / 2, height / 2)
  ctx.rotate(-30 * Math.PI / 180)
  ctx.fillText(text, 0, 0)

  return {
    png: await canvas.encode('png'),
    width,
    height,
  }
}

export async function addPdfWatermark(request: WatermarkPdfRequest): Promise<PdfOperationResult> {
  if (!request.text.trim()) throw new Error('请输入水印文字')

  const bytes = await readFile(request.sourcePath)
  const pdf = await PDFDocument.load(bytes)
  const opacity = Math.max(0.08, Math.min(0.5, request.opacity ?? 0.18))
  const fontSize = Math.max(18, Math.min(96, request.fontSize ?? 42))
  const watermark = await createWatermarkPng(request.text.trim(), fontSize, opacity)
  const embedded = await pdf.embedPng(watermark.png)

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    page.drawImage(embedded, {
      x: (width - watermark.width) / 2,
      y: (height - watermark.height) / 2,
      width: watermark.width,
      height: watermark.height,
    })
  }

  await ensureParentDirectory(request.outputPath)
  await writeFile(request.outputPath, await pdf.save())
  return {
    outputPath: request.outputPath,
    outputSize: (await stat(request.outputPath)).size,
  }
}
