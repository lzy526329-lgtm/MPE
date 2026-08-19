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
import type {
  ExtractPdfImagesRequest,
  ExtractPdfImagesResult,
  CompressPdfRequest,
  ImagesToPdfRequest,
  MergePdfRequest,
  PdfFileInfo,
  PdfOperationResult,
  PdfToImagesRequest,
  PdfToImagesResult,
  SplitPdfRequest,
  SplitPdfResult,
  WatermarkPdfRequest,
} from '../electron/pdf'

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
      inspectPdf: (pdfPath: string) => Promise<PdfFileInfo>
      inspectPdfImage: (imagePath: string) => Promise<PdfFileInfo>
      mergePdf: (request: MergePdfRequest) => Promise<PdfOperationResult>
      splitPdf: (request: SplitPdfRequest) => Promise<SplitPdfResult>
      imagesToPdf: (request: ImagesToPdfRequest) => Promise<PdfOperationResult>
      pdfToImages: (request: PdfToImagesRequest) => Promise<PdfToImagesResult>
      compressPdf: (request: CompressPdfRequest) => Promise<PdfOperationResult>
      extractPdfImages: (request: ExtractPdfImagesRequest) => Promise<ExtractPdfImagesResult>
      addPdfWatermark: (request: WatermarkPdfRequest) => Promise<PdfOperationResult>
      choosePdfSavePath: (options?: { defaultPath?: string; title?: string }) => Promise<string | null>
      choosePdfOutputFolder: (defaultPath?: string) => Promise<string | null>
      parseWatermark: (url: string) => Promise<WatermarkResult>
      saveWatermark: (result: WatermarkResult) => Promise<SaveWatermarkResult | null>
      getSystemInfo: () => Promise<SystemInfo>
      scanDisk: () => Promise<ScanResult>
      cleanDisk: (ids: string[]) => Promise<CleanResult>
    }
  }
}
