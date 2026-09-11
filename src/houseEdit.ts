export function normalizeHouseEdit(value: { zIndex: number; flipX: boolean }): { zIndex: number; flipX: boolean } {
  return { zIndex: Math.max(0, Math.min(30, Math.round(value.zIndex))), flipX: value.flipX === true }
}
