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
  parseWatermark: (url: string): Promise<WatermarkResult> =>
    ipcRenderer.invoke('watermark:parse', url),
  saveWatermark: (result: WatermarkResult): Promise<SaveWatermarkResult | null> =>
    ipcRenderer.invoke('watermark:save', result),
  getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('system:info'),
  scanDisk: (): Promise<ScanResult> => ipcRenderer.invoke('disk:scan'),
  cleanDisk: (ids: string[]): Promise<CleanResult> => ipcRenderer.invoke('disk:clean', ids),
})
