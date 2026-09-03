export type ExclusiveSlotSnapshot = {
  idleAnimation: string
  bones: { name: string; parent?: string | null }[]
  slots: { name: string; bone: string; attachmentName?: string | null }[]
  animationBones: Record<string, string[]>
}

export type ExclusiveSlotPlan = {
  idleAnimation: string
  idleBoneNames: string[]
  baseSlotNames: string[]
  exclusiveSlots: {
    slotName: string
    attachmentName: string
    animationNames: string[]
  }[]
}

export type ExclusiveSkeleton = {
  slots: { data: { name: string; attachmentName?: string | null } }[]
  setAttachment: (slotName: string, attachmentName?: string | null) => unknown
}

function childrenMap(bones: ExclusiveSlotSnapshot['bones']) {
  const children = new Map<string, string[]>()
  for (const bone of bones) {
    if (!bone.parent) continue
    const list = children.get(bone.parent) ?? []
    list.push(bone.name)
    children.set(bone.parent, list)
  }
  return children
}

function descendantsOf(root: string, children: Map<string, string[]>) {
  const found = new Set<string>([root])
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of children.get(current) ?? []) {
      if (found.has(child)) continue
      found.add(child)
      stack.push(child)
    }
  }
  return found
}

function ancestorsOf(name: string, parentOf: Map<string, string | null>) {
  const found = new Set<string>()
  let current: string | null | undefined = name
  while (current) {
    found.add(current)
    current = parentOf.get(current)
  }
  return found
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort()
}

export function buildExclusiveSlotPlan(snapshot: ExclusiveSlotSnapshot): ExclusiveSlotPlan {
  const idleBones = new Set(snapshot.animationBones[snapshot.idleAnimation] ?? [])
  const parentOf = new Map(snapshot.bones.map((bone) => [bone.name, bone.parent ?? null]))
  const children = childrenMap(snapshot.bones)
  const idleTree = new Set<string>()
  for (const bone of idleBones) {
    for (const name of descendantsOf(bone, children)) idleTree.add(name)
    for (const name of ancestorsOf(bone, parentOf)) {
      if (name !== 'root') idleTree.add(name)
    }
  }

  const exclusiveSlots: ExclusiveSlotPlan['exclusiveSlots'] = []
  const baseSlotNames: string[] = []

  for (const slot of snapshot.slots) {
    const attachmentName = slot.attachmentName?.trim()
    if (!attachmentName) continue

    const tree = descendantsOf(slot.bone, children)
    const owners = Object.entries(snapshot.animationBones)
      .filter(([, bones]) => bones.some((bone) => tree.has(bone)))
      .map(([name]) => name)
    const ownersKeyIdle = owners.some((name) => (snapshot.animationBones[name] ?? []).some((bone) => idleBones.has(bone)))
    const onIdleTree = idleTree.has(slot.bone)

    if (!onIdleTree && owners.length > 0 && !ownersKeyIdle) {
      exclusiveSlots.push({
        slotName: slot.name,
        attachmentName,
        animationNames: uniqueSorted(owners),
      })
      continue
    }
    baseSlotNames.push(slot.name)
  }

  return {
    idleAnimation: snapshot.idleAnimation,
    idleBoneNames: [...idleBones],
    baseSlotNames,
    exclusiveSlots,
  }
}

export function applyExclusiveSlots(
  skeleton: ExclusiveSkeleton,
  plan: ExclusiveSlotPlan,
  animationName?: string | null,
) {
  const playingExclusive = plan.exclusiveSlots.some((slot) => slot.animationNames.includes(animationName ?? ''))

  for (const slot of plan.exclusiveSlots) {
    const show = slot.animationNames.includes(animationName ?? '')
    skeleton.setAttachment(slot.slotName, show ? slot.attachmentName : undefined)
  }

  if (playingExclusive) {
    for (const name of plan.baseSlotNames) skeleton.setAttachment(name, undefined)
    return
  }

  for (const name of plan.baseSlotNames) {
    const data = skeleton.slots.find((item) => item.data.name === name)?.data
    if (data?.attachmentName) skeleton.setAttachment(name, data.attachmentName)
  }
}

export function snapshotFromSpineData(spineData: {
  bones: { name: string; parent?: { name: string } | null }[]
  slots: { name: string; attachmentName?: string | null; boneData: { name: string } }[]
  animations: { name: string; timelines: { boneIndex?: number }[] }[]
}): ExclusiveSlotSnapshot {
  const names = spineData.animations.map((item) => item.name)
  const idleAnimation = ['idle', 'stand', 'normal'].find((name) => names.includes(name)) ?? names[0] ?? 'idle'
  const animationBones: Record<string, string[]> = {}
  for (const animation of spineData.animations) {
    const bones = new Set<string>()
    for (const timeline of animation.timelines) {
      if (typeof timeline.boneIndex !== 'number') continue
      const bone = spineData.bones[timeline.boneIndex]
      if (bone?.name) bones.add(bone.name)
    }
    animationBones[animation.name] = [...bones]
  }
  return {
    idleAnimation,
    bones: spineData.bones.map((bone) => ({ name: bone.name, parent: bone.parent?.name ?? null })),
    slots: spineData.slots.map((slot) => ({
      name: slot.name,
      bone: slot.boneData.name,
      attachmentName: slot.attachmentName,
    })),
    animationBones,
  }
}

function clearExclusiveAttachments(skeleton: ExclusiveSkeleton, plan: ExclusiveSlotPlan) {
  for (const slot of plan.exclusiveSlots) {
    skeleton.setAttachment(slot.slotName, null)
  }
}

const exclusivePlanBySpineData = new WeakMap<object, ExclusiveSlotPlan>()

function exclusivePlanFor(spineData: Parameters<typeof snapshotFromSpineData>[0]) {
  const cached = exclusivePlanBySpineData.get(spineData)
  if (cached) return cached
  const plan = buildExclusiveSlotPlan(snapshotFromSpineData(spineData))
  exclusivePlanBySpineData.set(spineData, plan)
  return plan
}

export function bindSleepExclusiveSlots(character: {
  spineData?: Parameters<typeof snapshotFromSpineData>[0]
  skeleton: ExclusiveSkeleton & { data?: Parameters<typeof snapshotFromSpineData>[0]; setSlotsToSetupPose?: () => void }
  state: {
    setAnimation: (track: number, name: string, loop: boolean) => unknown
    getCurrent?: (track: number) => { animation?: { name: string } } | null
  }
  update?: (delta: number) => void
  __sleepExclusiveBound?: boolean
}) {
  const spineData = character.spineData ?? character.skeleton.data
  if (!spineData) return
  const plan = exclusivePlanFor(spineData)
  // Clear instance attachments only — never mutate shared SlotData (many previews share one spineData).
  clearExclusiveAttachments(character.skeleton, plan)
  if (character.__sleepExclusiveBound || !character.update) return
  const originalUpdate = character.update.bind(character)
  const originalSetSlotsToSetupPose = character.skeleton.setSlotsToSetupPose?.bind(character.skeleton)
  if (originalSetSlotsToSetupPose) {
    character.skeleton.setSlotsToSetupPose = () => {
      originalSetSlotsToSetupPose()
      clearExclusiveAttachments(character.skeleton, plan)
    }
  }
  character.update = (delta: number) => {
    originalUpdate(delta)
    const name = character.state.getCurrent?.(0)?.animation?.name
    applyExclusiveSlots(character.skeleton, plan, name)
    // pixi-spine syncs slot visuals inside update(); re-run once so exclusive
    // attachment changes are visible in the same frame (preview + pet).
    originalUpdate(0)
  }
  character.__sleepExclusiveBound = true
}

export function playExclusiveAnimation(
  character: {
    skeleton: { setSlotsToSetupPose?: () => void }
    state: { setAnimation: (track: number, name: string, loop: boolean) => unknown }
    update?: (delta: number) => void
  },
  name: string,
  loop: boolean,
) {
  character.skeleton.setSlotsToSetupPose?.()
  character.state.setAnimation(0, name, loop)
  character.update?.(0)
}
