export type PendingSpriteSheetImport = {
  objectUrl: string
  name: string
  sheetWidth: number
  sheetHeight: number
  cols: number
  rows: number
  frameCount: number
}

let pendingImport: PendingSpriteSheetImport | null = null

export function savePendingSpriteSheetImport(payload: PendingSpriteSheetImport) {
  if (pendingImport?.objectUrl) URL.revokeObjectURL(pendingImport.objectUrl)
  pendingImport = payload
}

export function readPendingSpriteSheetImport(): PendingSpriteSheetImport | null {
  const data = pendingImport
  pendingImport = null
  return data
}

export function revokePendingSpriteSheetImport() {
  if (pendingImport?.objectUrl) URL.revokeObjectURL(pendingImport.objectUrl)
  pendingImport = null
}
