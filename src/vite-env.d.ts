/// <reference types="vite/client" />

import type { CompressRequest, CompressResult } from '../electron/compress'
import type { CutoutRequest, CutoutResult } from '../electron/cutout'
import type {
  ArchiveInfo,
  CompressArchiveRequest,
  CompressArchiveResult,
  CompressionSource,
  ExtractRequest,
  ExtractResult,
} from '../electron/archive'
import type { SaveWatermarkResult, WatermarkResult } from '../electron/watermark'
import type { PhotoplusDownloadResult, PhotoplusProgress } from '../electron/photoplus'
import type { PetBounds, PetChatMessage, PetReminderItem, PetStatus, PetViewportAnchor } from '../electron/pet'
import type { PetAiReply, PetAiSettingsView, PetChatHistoryItem } from '../electron/petAi'
import type { PetCharacter } from '../electron/petCharacters'
import type {
  PetClipKey,
  PetClipView,
  PetSkinView,
  SavePetClipRequest,
  UpdatePetClipRequest,
} from '../electron/petSkin'
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
import type { UpdateState } from '../electron/updater'
import type { FarmActionResult } from '../electron/farm/farmEngine'
import type { CropId } from '../electron/farm/farmTypes'

declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform
      compressImage: (request: CompressRequest) => Promise<CompressResult>
      cutoutImage: (request: CutoutRequest) => Promise<CutoutResult>
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
      downloadPhotoplus: (url: string) => Promise<PhotoplusDownloadResult>
      pausePhotoplus: () => Promise<{ ok: boolean; status: string }>
      resumePhotoplus: () => Promise<{ ok: boolean; status: string }>
      cancelPhotoplus: () => Promise<{ ok: boolean; status: string }>
      onPhotoplusProgress: (callback: (progress: PhotoplusProgress) => void) => () => void
      getSystemInfo: () => Promise<SystemInfo>
      scanDisk: () => Promise<ScanResult>
      cleanDisk: (ids: string[]) => Promise<CleanResult>
      getPetEnabled: () => Promise<boolean>
      setPetEnabled: (enabled: boolean) => Promise<boolean>
      onPetEnabledChanged: (callback: (enabled: boolean) => void) => () => void
      petGetBounds: () => Promise<PetBounds | null>
      setPetViewport: (
        size: number | { width: number; height: number },
        anchor?: PetViewportAnchor,
      ) => Promise<{ width: number; height: number }>
      petSetPosition: (x: number, y: number) => Promise<{ x: number; y: number } | null>
      petIgnoreMouse: (ignore: boolean) => Promise<void>
      petShowMain: (pageId?: string) => Promise<void>
      onMainNavigate: (callback: (pageId: string) => void) => () => void
      onToolPrefill: (
        callback: (payload: { pageId: string; input: string }) => void,
      ) => () => void
      petPopupMenu: () => Promise<void>
      onPetMinigame: (
        callback: (event: { action: 'start'; id: 'ball-hit' | 'heart-rally' } | { action: 'stop' }) => void,
      ) => () => void
      notifyPetMinigameEnded: () => Promise<void>
      getPetStatus: () => Promise<PetStatus>
      setPetAutoWalk: (autoWalk: boolean) => Promise<PetStatus>
      setPetSize: (size: number) => Promise<PetStatus>
      getPetCharacters: () => Promise<PetCharacter[]>
      setPetCharacter: (characterId: string) => Promise<PetStatus>
      feedPet: () => Promise<PetStatus>
      cleanPet: () => Promise<PetStatus>
      restPet: () => Promise<PetStatus>
      updatePetProfile: (patch: { name?: string }) => Promise<PetStatus>
      getPetReminders: () => Promise<PetReminderItem[]>
      upsertPetReminder: (request: {
        id?: string
        enabled: boolean
        mode: 'interval-repeat' | 'interval-once' | 'datetime-once' | 'daily-time'
        minutes: number
        onceAt: string
        dailyTime: string
        text: string
        requireConfirm: boolean
      }) => Promise<PetReminderItem[]>
      deletePetReminder: (id: string) => Promise<PetReminderItem[]>
      confirmPetReminder: (reminderId?: string) => Promise<PetReminderItem[]>
      onPetStatusChanged: (callback: (status: PetStatus) => void) => () => void
      onPetRemindersUpdated: (callback: (reminders: PetReminderItem[]) => void) => () => void
      onPetChatMessage: (callback: (message: PetChatMessage) => void) => () => void
      onPetChatClear: (callback: () => void) => () => void
      petAiGetSettings: () => Promise<PetAiSettingsView>
      petAiSaveSettings: (input: { apiKey?: string; proactiveAiEnabled?: boolean }) => Promise<PetAiSettingsView>
      petAiClearSettings: () => Promise<PetAiSettingsView>
      petAiGetHistory: () => Promise<PetChatHistoryItem[]>
      petAiClearHistory: () => Promise<PetChatHistoryItem[]>
      petAiClearMemory: () => Promise<{ cleared: number }>
      petAiGetOwnerNotes: () => Promise<{ notes: string }>
      petAiSetOwnerNotes: (notes: string) => Promise<{ notes: string }>
      petAiSend: (text: string) => Promise<PetAiReply>
      onPetAiBubble: (callback: (payload: { text: string }) => void) => () => void
      onPetCareReact: (
        callback: (payload: {
          kind: 'feed' | 'clean'
          text: string
          animation: 'victory'
        }) => void,
      ) => () => void
      getPetSkin: () => Promise<PetSkinView>
      savePetClip: (request: SavePetClipRequest) => Promise<PetClipView>
      updatePetClip: (request: UpdatePetClipRequest) => Promise<PetSkinView>
      removePetClip: (key: PetClipKey) => Promise<PetSkinView>
      resetPetSkin: () => Promise<PetSkinView>
      onPetSkinChanged: (callback: (skin: PetSkinView) => void) => () => void
      getAppUpdateState: () => Promise<UpdateState>
      checkAppUpdate: () => Promise<{
        updateAvailable: boolean
        currentVersion: string
        latestVersion?: string
        releaseName?: string
        releaseNotes?: string
        packaged: boolean
        message: string
      }>
      downloadAppUpdate: () => Promise<{ ok: boolean; message: string }>
      installAppUpdate: () => Promise<{ ok: boolean; message: string }>
      onAppUpdateState: (callback: (state: UpdateState) => void) => () => void
      getOpenAtLogin: () => Promise<boolean>
      setOpenAtLogin: (enabled: boolean) => Promise<boolean>
      onOpenAtLoginChanged: (callback: (enabled: boolean) => void) => () => void
      farmGetState: () => Promise<FarmActionResult>
      farmPlant: (request: { plotIndex: number; cropId: CropId }) => Promise<FarmActionResult>
      farmWater: (request: { plotIndex: number }) => Promise<FarmActionResult>
      farmDebug: (request: { plotIndex: number }) => Promise<FarmActionResult>
      farmHarvest: (request: { plotIndex: number }) => Promise<FarmActionResult>
      farmClaimDailySeeds: () => Promise<FarmActionResult>
      farmWaterAll: () => Promise<FarmActionResult>
      farmHarvestAll: () => Promise<FarmActionResult>
    }
  }
}
