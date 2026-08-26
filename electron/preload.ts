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
import type { PetAiReply, PetAiSettingsView, PetChatHistoryItem } from './petAi'
import type { PetBounds, PetChatMessage, PetReminderItem, PetStatus, PetViewportAnchor } from './pet'
import type { PetCharacter } from './petCharacters'
import type {
  PetClipKey,
  PetClipView,
  PetSkinView,
  SavePetClipRequest,
  UpdatePetClipRequest,
} from './petSkin'
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
import type { UpdateState } from './updater'

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
  getPetEnabled: (): Promise<boolean> => ipcRenderer.invoke('pet:get-enabled'),
  setPetEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('pet:set-enabled', enabled),
  onPetEnabledChanged: (callback: (enabled: boolean) => void) => {
    const listener = (_event: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on('pet:enabled-changed', listener)
    return () => ipcRenderer.removeListener('pet:enabled-changed', listener)
  },
  petGetBounds: (): Promise<PetBounds | null> => ipcRenderer.invoke('pet:get-bounds'),
  setPetViewport: (
    size: number | { width: number; height: number },
    anchor?: PetViewportAnchor,
  ): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('pet:set-viewport', size, anchor),
  petSetPosition: (x: number, y: number): Promise<{ x: number; y: number } | null> =>
    ipcRenderer.invoke('pet:set-position', x, y),
  petIgnoreMouse: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke('pet:ignore-mouse', ignore),
  petShowMain: (pageId?: string): Promise<void> => ipcRenderer.invoke('pet:show-main', pageId),
  onMainNavigate: (callback: (pageId: string) => void) => {
    const listener = (_event: unknown, pageId: string) => callback(pageId)
    ipcRenderer.on('main:navigate', listener)
    return () => ipcRenderer.removeListener('main:navigate', listener)
  },
  onToolPrefill: (callback: (payload: { pageId: string; input: string }) => void) => {
    const listener = (_event: unknown, payload: { pageId: string; input: string }) =>
      callback(payload)
    ipcRenderer.on('tool:prefill', listener)
    return () => ipcRenderer.removeListener('tool:prefill', listener)
  },
  petPopupMenu: (): Promise<void> => ipcRenderer.invoke('pet:popup-menu'),
  onPetMinigame: (
    callback: (event: { action: 'start'; id: 'ball-hit' | 'heart-rally' } | { action: 'stop' }) => void,
  ) => {
    const listener = (
      _event: unknown,
      payload: { action: 'start'; id: 'ball-hit' | 'heart-rally' } | { action: 'stop' },
    ) => callback(payload)
    ipcRenderer.on('pet:minigame', listener)
    return () => ipcRenderer.removeListener('pet:minigame', listener)
  },
  notifyPetMinigameEnded: (): Promise<void> => ipcRenderer.invoke('pet:minigame-ended'),
  getPetStatus: (): Promise<PetStatus> => ipcRenderer.invoke('pet:get-status'),
  setPetAutoWalk: (autoWalk: boolean): Promise<PetStatus> =>
    ipcRenderer.invoke('pet:set-auto-walk', autoWalk),
  setPetSize: (size: number): Promise<PetStatus> => ipcRenderer.invoke('pet:set-size', size),
  getPetCharacters: (): Promise<PetCharacter[]> => ipcRenderer.invoke('pet:list-characters'),
  setPetCharacter: (characterId: string): Promise<PetStatus> =>
    ipcRenderer.invoke('pet:set-character', characterId),
  feedPet: (): Promise<PetStatus> => ipcRenderer.invoke('pet:feed'),
  cleanPet: (): Promise<PetStatus> => ipcRenderer.invoke('pet:clean'),
  restPet: (): Promise<PetStatus> => ipcRenderer.invoke('pet:rest'),
  updatePetProfile: (patch: { name?: string }): Promise<PetStatus> =>
    ipcRenderer.invoke('pet:update-profile', patch),
  getPetReminders: (): Promise<PetReminderItem[]> => ipcRenderer.invoke('pet:get-reminders'),
  upsertPetReminder: (request: {
    id?: string
    enabled: boolean
    mode: 'interval-repeat' | 'interval-once' | 'datetime-once' | 'daily-time'
    minutes: number
    onceAt: string
    dailyTime: string
    text: string
    requireConfirm: boolean
  }): Promise<PetReminderItem[]> => ipcRenderer.invoke('pet:upsert-reminder', request),
  deletePetReminder: (id: string): Promise<PetReminderItem[]> =>
    ipcRenderer.invoke('pet:delete-reminder', id),
  confirmPetReminder: (reminderId?: string): Promise<PetReminderItem[]> =>
    ipcRenderer.invoke('pet:confirm-reminder', reminderId),
  onPetStatusChanged: (callback: (status: PetStatus) => void) => {
    const listener = (_event: unknown, status: PetStatus) => callback(status)
    ipcRenderer.on('pet:status-changed', listener)
    return () => ipcRenderer.removeListener('pet:status-changed', listener)
  },
  onPetRemindersUpdated: (callback: (reminders: PetReminderItem[]) => void) => {
    const listener = (_event: unknown, reminders: PetReminderItem[]) => callback(reminders)
    ipcRenderer.on('pet:reminders-updated', listener)
    return () => ipcRenderer.removeListener('pet:reminders-updated', listener)
  },
  onPetChatMessage: (callback: (message: PetChatMessage) => void) => {
    const listener = (_event: unknown, message: PetChatMessage) => callback(message)
    ipcRenderer.on('pet:chat-message', listener)
    return () => ipcRenderer.removeListener('pet:chat-message', listener)
  },
  onPetChatClear: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('pet:chat-clear', listener)
    return () => ipcRenderer.removeListener('pet:chat-clear', listener)
  },
  petAiGetSettings: (): Promise<PetAiSettingsView> => ipcRenderer.invoke('pet:ai-get-settings'),
  petAiSaveSettings: (input: { apiKey?: string; proactiveAiEnabled?: boolean }): Promise<PetAiSettingsView> =>
    ipcRenderer.invoke('pet:ai-save-settings', input),
  petAiClearSettings: (): Promise<PetAiSettingsView> => ipcRenderer.invoke('pet:ai-clear-settings'),
  petAiGetHistory: (): Promise<PetChatHistoryItem[]> => ipcRenderer.invoke('pet:ai-get-history'),
  petAiClearHistory: (): Promise<PetChatHistoryItem[]> => ipcRenderer.invoke('pet:ai-clear-history'),
  petAiClearMemory: (): Promise<{ cleared: number }> => ipcRenderer.invoke('pet:ai-clear-memory'),
  petAiSend: (text: string): Promise<PetAiReply> => ipcRenderer.invoke('pet:ai-send', text),
  onPetAiBubble: (callback: (payload: { text: string }) => void) => {
    const listener = (_event: unknown, payload: { text: string }) => callback(payload)
    ipcRenderer.on('pet:ai-bubble', listener)
    return () => ipcRenderer.removeListener('pet:ai-bubble', listener)
  },
  onPetCareReact: (
    callback: (payload: { kind: 'feed' | 'clean'; text: string; animation: 'victory' }) => void,
  ) => {
    const listener = (
      _event: unknown,
      payload: { kind: 'feed' | 'clean'; text: string; animation: 'victory' },
    ) => callback(payload)
    ipcRenderer.on('pet:care-react', listener)
    return () => ipcRenderer.removeListener('pet:care-react', listener)
  },
  getPetSkin: (): Promise<PetSkinView> => ipcRenderer.invoke('pet:get-skin'),
  savePetClip: (request: SavePetClipRequest): Promise<PetClipView> =>
    ipcRenderer.invoke('pet:save-clip', {
      ...request,
      bytes: Buffer.from(request.bytes),
    }),
  updatePetClip: (request: UpdatePetClipRequest): Promise<PetSkinView> =>
    ipcRenderer.invoke('pet:update-clip', request),
  removePetClip: (key: PetClipKey): Promise<PetSkinView> =>
    ipcRenderer.invoke('pet:remove-clip', key),
  resetPetSkin: (): Promise<PetSkinView> => ipcRenderer.invoke('pet:reset-skin'),
  onPetSkinChanged: (callback: (skin: PetSkinView) => void) => {
    const listener = (_event: unknown, skin: PetSkinView) => callback(skin)
    ipcRenderer.on('pet:skin-changed', listener)
    return () => ipcRenderer.removeListener('pet:skin-changed', listener)
  },
  getAppUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke('app:get-version'),
  checkAppUpdate: (): Promise<{
    updateAvailable: boolean
    currentVersion: string
    latestVersion?: string
    releaseName?: string
    releaseNotes?: string
    packaged: boolean
    message: string
  }> => ipcRenderer.invoke('app:check-update'),
  downloadAppUpdate: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('app:download-update'),
  installAppUpdate: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('app:install-update'),
  onAppUpdateState: (callback: (state: UpdateState) => void) => {
    const listener = (_event: unknown, next: UpdateState) => callback(next)
    ipcRenderer.on('app:update-state', listener)
    return () => ipcRenderer.removeListener('app:update-state', listener)
  },
  getOpenAtLogin: (): Promise<boolean> => ipcRenderer.invoke('app:get-open-at-login'),
  setOpenAtLogin: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('app:set-open-at-login', enabled),
  onOpenAtLoginChanged: (callback: (enabled: boolean) => void) => {
    const listener = (_event: unknown, enabled: boolean) => callback(enabled)
    ipcRenderer.on('app:open-at-login-changed', listener)
    return () => ipcRenderer.removeListener('app:open-at-login-changed', listener)
  },
})
