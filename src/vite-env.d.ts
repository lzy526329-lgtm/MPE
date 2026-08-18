/// <reference types="vite/client" />

import type { CompressRequest, CompressResult } from '../electron/compress'
import type {
  ArchiveInfo,
  CompressArchiveRequest,
  CompressArchiveResult,
  CompressionSource,
  ExtractRequest,
  ExtractResult,
} from '../electron/archive'
import type { SaveWatermarkResult, WatermarkResult } from '../electron/watermark'
import type { SystemInfo } from '../electron/systemInfo'
import type { ScanResult, CleanResult } from '../electron/diskClean'

declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform
      compressImage: (request: CompressRequest) => Promise<CompressResult>
      getPathForFile: (file: File) => string
      chooseArchive: () => Promise<ArchiveInfo | null>
      inspectArchive: (archivePath: string) => Promise<ArchiveInfo>
      chooseDestination: (defaultPath?: string) => Promise<string | null>
      extractArchive: (request: ExtractRequest) => Promise<ExtractResult>
      chooseCompressionSources: (mode: 'files' | 'directory') => Promise<CompressionSource[]>
      inspectCompressionSource: (sourcePath: string) => Promise<CompressionSource>
      compressArchive: (request: CompressArchiveRequest) => Promise<CompressArchiveResult>
      openPath: (targetPath: string) => Promise<string>
      revealPath: (targetPath: string) => Promise<void>
      parseWatermark: (url: string) => Promise<WatermarkResult>
      saveWatermark: (result: WatermarkResult) => Promise<SaveWatermarkResult | null>
      getSystemInfo: () => Promise<SystemInfo>
      scanDisk: () => Promise<ScanResult>
      cleanDisk: (ids: string[]) => Promise<CleanResult>
    }
  }
}
