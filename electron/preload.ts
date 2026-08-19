import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CompressRequest, CompressResult } from './compress'
import type {
  ArchiveInfo,
  CompressArchiveRequest,
  CompressArchiveResult,
  CompressionSource,
  ExtractRequest,
  ExtractResult,
} from './archive'
import type { SaveWatermarkResult, WatermarkResult } from './watermark'
import type { SystemInfo } from './systemInfo'
import type { ScanResult, CleanResult } from './diskClean'
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
} from './pdf'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  compressImage: (request: CompressRequest): Promise<CompressResult> =>
    ipcRenderer.invoke('image:compress', request),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  chooseArchive: (): Promise<ArchiveInfo | null> => ipcRenderer.invoke('archive:choose'),
  inspectArchive: (archivePath: string): Promise<ArchiveInfo> =>
    ipcRenderer.invoke('archive:inspect', archivePath),
  chooseDestination: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('archive:choose-destination', defaultPath),
  extractArchive: (request: ExtractRequest): Promise<ExtractResult> =>
    ipcRenderer.invoke('archive:extract', request),
  chooseCompressionSources: (mode: 'files' | 'directory'): Promise<CompressionSource[]> =>
    ipcRenderer.invoke('archive:choose-sources', mode),
  inspectCompressionSource: (sourcePath: string): Promise<CompressionSource> =>
    ipcRenderer.invoke('archive:inspect-source', sourcePath),
  compressArchive: (request: CompressArchiveRequest): Promise<CompressArchiveResult> =>
    ipcRenderer.invoke('archive:compress', request),
  openPath: (targetPath: string): Promise<string> => ipcRenderer.invoke('path:open', targetPath),
  revealPath: (targetPath: string): Promise<void> => ipcRenderer.invoke('path:reveal', targetPath),
  inspectPdf: (pdfPath: string): Promise<PdfFileInfo> => ipcRenderer.invoke('pdf:inspect', pdfPath),
  inspectPdfImage: (imagePath: string): Promise<PdfFileInfo> =>
    ipcRenderer.invoke('pdf:inspect-image', imagePath),
  mergePdf: (request: MergePdfRequest): Promise<PdfOperationResult> =>
    ipcRenderer.invoke('pdf:merge', request),
  splitPdf: (request: SplitPdfRequest): Promise<SplitPdfResult> =>
    ipcRenderer.invoke('pdf:split', request),
  imagesToPdf: (request: ImagesToPdfRequest): Promise<PdfOperationResult> =>
    ipcRenderer.invoke('pdf:images-to-pdf', request),
  pdfToImages: (request: PdfToImagesRequest): Promise<PdfToImagesResult> =>
    ipcRenderer.invoke('pdf:to-images', request),
  compressPdf: (request: CompressPdfRequest): Promise<PdfOperationResult> =>
    ipcRenderer.invoke('pdf:compress', request),
  extractPdfImages: (request: ExtractPdfImagesRequest): Promise<ExtractPdfImagesResult> =>
    ipcRenderer.invoke('pdf:extract-images', request),
  addPdfWatermark: (request: WatermarkPdfRequest): Promise<PdfOperationResult> =>
    ipcRenderer.invoke('pdf:add-watermark', request),
  choosePdfSavePath: (options?: { defaultPath?: string; title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('pdf:choose-save', options),
  choosePdfOutputFolder: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('pdf:choose-folder', defaultPath),
  parseWatermark: (url: string): Promise<WatermarkResult> =>
    ipcRenderer.invoke('watermark:parse', url),
  saveWatermark: (result: WatermarkResult): Promise<SaveWatermarkResult | null> =>
    ipcRenderer.invoke('watermark:save', result),
  getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('system:info'),
  scanDisk: (): Promise<ScanResult> => ipcRenderer.invoke('disk:scan'),
  cleanDisk: (ids: string[]): Promise<CleanResult> => ipcRenderer.invoke('disk:clean', ids),
})
