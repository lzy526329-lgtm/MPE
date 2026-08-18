import { chmod, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { path7za } from '7zip-bin'
import { createExtractorFromFile } from 'node-unrar-js'

export interface ArchiveInfo {
  path: string
  name: string
  size: number
  format: string
  defaultDestination: string
}

export interface ExtractRequest {
  archivePath: string
  destinationRoot?: string
  password?: string
}

export interface ExtractResult {
  outputPath: string
  fileCount: number
}

export type ArchiveOutputFormat = 'zip' | '7z' | 'tar.gz'

export interface CompressionSource {
  path: string
  name: string
  size: number
  isDirectory: boolean
  defaultDestination: string
}

export interface CompressArchiveRequest {
  sources: string[]
  destinationRoot: string
  outputName: string
  format: ArchiveOutputFormat
  password?: string
}

export interface CompressArchiveResult {
  outputPath: string
  inputSize: number
  outputSize: number
  sourceCount: number
}

const SUPPORTED_EXTENSIONS = [
  '.tar.gz',
  '.tar.bz2',
  '.tar.xz',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.tgz',
  '.tbz2',
  '.txz',
  '.gz',
  '.bz2',
  '.xz',
  '.cab',
]

export const archiveFilters = [
  {
    name: '压缩包',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'cab'],
  },
]

function getExtension(filePath: string) {
  const lower = filePath.toLowerCase()
  return SUPPORTED_EXTENSIONS.find((extension) => lower.endsWith(extension))
}

function getBaseName(filePath: string) {
  const extension = getExtension(filePath)
  return path.basename(filePath, extension)
}

export async function inspectArchive(archivePath: string): Promise<ArchiveInfo> {
  const extension = getExtension(archivePath)
  if (!extension) throw new Error('不支持该压缩包格式')

  const fileStat = await stat(archivePath)
  if (!fileStat.isFile()) throw new Error('所选内容不是文件')

  return {
    path: archivePath,
    name: path.basename(archivePath),
    size: fileStat.size,
    format: extension.slice(1).toUpperCase(),
    defaultDestination: path.dirname(archivePath),
  }
}

export async function inspectCompressionSource(sourcePath: string): Promise<CompressionSource> {
  const sourceStat = await stat(sourcePath)
  return {
    path: sourcePath,
    name: path.basename(sourcePath),
    size: sourceStat.isFile() ? sourceStat.size : await getDirectorySize(sourcePath),
    isDirectory: sourceStat.isDirectory(),
    defaultDestination: path.dirname(sourcePath),
  }
}

function isSafeEntryName(name: string) {
  const normalized = name.replace(/\\/g, '/')
  return (
    normalized.length > 0 &&
    !normalized.startsWith('/') &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !normalized.split('/').includes('..') &&
    !normalized.includes('\0')
  )
}

async function createUniqueOutputPath(root: string, archivePath: string) {
  const baseName = getBaseName(archivePath)
  let candidate = path.join(root, baseName)
  let suffix = 2

  while (true) {
    try {
      // mkdir 是原子操作，并发解压时也不会选中同一个目录。
      await mkdir(candidate)
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      candidate = path.join(root, `${baseName} ${suffix}`)
      suffix += 1
    }
  }
}

function executablePath() {
  return appPathForUnpacked(path7za)
}

function appPathForUnpacked(filePath: string) {
  return process.env.NODE_ENV === 'development'
    ? filePath
    : filePath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
}

function run7zip(args: string[], cwd?: string) {
  return new Promise<string>((resolve, reject) => {
    const command = executablePath()
    const child = spawn(command, args, { windowsHide: true, cwd })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      const details = `${stdout}\n${stderr}`
      if (/Wrong password|Data Error in encrypted file/i.test(details)) {
        reject(new Error('密码错误或压缩包已损坏'))
      } else {
        reject(new Error('解压失败，压缩包可能已损坏或需要密码'))
      }
    })
  })
}

async function getDirectorySize(directory: string): Promise<number> {
  let size = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      size += await getDirectorySize(entryPath)
    } else if (entry.isFile()) {
      size += (await stat(entryPath)).size
    }
  }
  return size
}

function safeOutputName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^\.+|\.+$/g, '')
  return cleaned || '压缩文件'
}

function outputBaseName(name: string, extension: string) {
  const cleaned = safeOutputName(name)
  const suffix = `.${extension}`
  return cleaned.toLowerCase().endsWith(suffix)
    ? cleaned.slice(0, -suffix.length) || '压缩文件'
    : cleaned
}

async function uniqueArchivePath(
  destinationRoot: string,
  outputName: string,
  extension: string,
) {
  const baseName = outputBaseName(outputName, extension)
  let candidate = path.join(destinationRoot, `${baseName}.${extension}`)
  let suffix = 2

  while (true) {
    try {
      await stat(candidate)
      candidate = path.join(destinationRoot, `${baseName} ${suffix}.${extension}`)
      suffix += 1
    } catch {
      return candidate
    }
  }
}

function relativeSourceArguments(sources: string[]) {
  if (sources.length === 0) throw new Error('请至少选择一个文件或文件夹')

  const sourceRoot = path.dirname(sources[0])
  if (sources.some((source) => path.dirname(source) !== sourceRoot)) {
    throw new Error('一次压缩的文件需要位于同一目录')
  }

  return {
    sourceRoot,
    sourceArguments: sources.map((source) => `.${path.sep}${path.basename(source)}`),
  }
}

export async function compressArchive(
  request: CompressArchiveRequest,
): Promise<CompressArchiveResult> {
  if (request.sources.length === 0) throw new Error('请至少选择一个文件或文件夹')
  if (request.format === 'tar.gz' && request.password) {
    throw new Error('tar.gz 不支持密码加密')
  }

  const sources = await Promise.all(request.sources.map(inspectCompressionSource))
  const inputSize = sources.reduce((total, source) => total + source.size, 0)
  const { sourceRoot, sourceArguments } = relativeSourceArguments(request.sources)
  await mkdir(request.destinationRoot, { recursive: true })
  if (process.platform !== 'win32') await chmod(executablePath(), 0o755)

  const outputPath = await uniqueArchivePath(
    request.destinationRoot,
    request.outputName,
    request.format,
  )
  const passwordArguments = request.password ? [`-p${request.password}`] : []

  if (request.format === 'tar.gz') {
    const stagePath = await mkdtemp(path.join(os.tmpdir(), 'gognju-compress-'))
    const tarPath = path.join(stagePath, `${outputBaseName(request.outputName, request.format)}.tar`)
    try {
      await run7zip(['a', '-ttar', '-y', '-bd', tarPath, ...sourceArguments], sourceRoot)
      await run7zip(['a', '-tgzip', '-y', '-bd', outputPath, tarPath])
    } finally {
      await rm(stagePath, { recursive: true, force: true })
    }
  } else {
    const typeArguments =
      request.format === 'zip'
        ? ['-tzip', ...(request.password ? ['-mem=AES256'] : [])]
        : ['-t7z', '-m0=lzma2', '-mx=7']
    await run7zip([
      'a',
      ...typeArguments,
      '-y',
      '-bd',
      ...passwordArguments,
      outputPath,
      ...sourceArguments,
    ], sourceRoot)
  }

  return {
    outputPath,
    inputSize,
    outputSize: (await stat(outputPath)).size,
    sourceCount: sources.length,
  }
}


function validate7zipListing(output: string) {
  // `-slt` 在分隔线之前还会输出压缩包自身的绝对路径，只校验其后的文件条目。
  const entrySection = output.split(/\r?\n-{10,}\r?\n/).slice(1).join('\n')
  const records = entrySection.split(/\r?\n\r?\n/)
  for (const record of records) {
    const entryName = record.match(/^Path = (.+)$/m)?.[1]
    if (!entryName) continue

    if (!isSafeEntryName(entryName)) {
      throw new Error('压缩包包含不安全的文件路径，已阻止解压')
    }
    if (/^(Symbolic|Hard) Link = .+$/m.test(record)) {
      throw new Error('压缩包包含链接文件，已阻止解压')
    }
  }
}

async function extractWith7zip(
  archivePath: string,
  outputPath: string,
  password?: string,
) {
  if (process.platform !== 'win32') {
    await chmod(executablePath(), 0o755)
  }

  const passwordArgument = password ? [`-p${password}`] : []
  const listing = await run7zip(['l', '-slt', ...passwordArgument, archivePath])
  validate7zipListing(listing)

  const isCompoundTar = ['.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz']
    .some((extension) => archivePath.toLowerCase().endsWith(extension))

  if (!isCompoundTar) {
    await run7zip(['x', '-y', '-bd', '-bb0', `-o${outputPath}`, ...passwordArgument, archivePath])
    return
  }

  // 7-Zip 对 tar.gz / tar.bz2 / tar.xz 一次只展开一层，需要再解一次中间 tar。
  const stagePath = path.join(outputPath, '.gognju-stage')
  await mkdir(stagePath)
  try {
    await run7zip(['x', '-y', '-bd', '-bb0', `-o${stagePath}`, ...passwordArgument, archivePath])
    const stageFiles = await readdir(stagePath)
    const tarPath = stageFiles.length === 1 ? path.join(stagePath, stageFiles[0]) : ''
    if (!tarPath) throw new Error('压缩包结构异常')

    const tarListing = await run7zip(['l', '-slt', tarPath])
    validate7zipListing(tarListing)
    await run7zip(['x', '-y', '-bd', '-bb0', `-o${outputPath}`, tarPath])
  } finally {
    await rm(stagePath, { recursive: true, force: true })
  }
}

async function extractRar(archivePath: string, outputPath: string, password?: string) {
  const extractor = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: outputPath,
    password: password || undefined,
    filenameTransform: (filename) => filename.replace(/\\/g, '/'),
  })

  const listing = extractor.getFileList()
  const headers = [...listing.fileHeaders]
  if (headers.some((header) => !isSafeEntryName(header.name))) {
    throw new Error('压缩包包含不安全的文件路径，已阻止解压')
  }

  // 必须完整消费迭代器，unrar 才会执行解压并释放底层对象。
  ;[...extractor.extract().files]
}

async function countFiles(directory: string): Promise<number> {
  let count = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      count += await countFiles(entryPath)
    } else if (entry.isFile()) {
      count += 1
    }
  }
  return count
}

export async function extractArchive(request: ExtractRequest): Promise<ExtractResult> {
  const info = await inspectArchive(request.archivePath)
  const destinationRoot = request.destinationRoot || info.defaultDestination
  await mkdir(destinationRoot, { recursive: true })

  const outputPath = await createUniqueOutputPath(destinationRoot, request.archivePath)

  try {
    if (info.format === 'RAR') {
      await extractRar(request.archivePath, outputPath, request.password)
    } else {
      await extractWith7zip(request.archivePath, outputPath, request.password)
    }

    return {
      outputPath,
      fileCount: await countFiles(outputPath),
    }
  } catch (error) {
    // 保留空目录不会覆盖用户已有内容，但应向界面返回明确原因。
    throw error instanceof Error ? error : new Error('解压失败')
  }
}
