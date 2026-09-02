import { describe, expect, it } from 'vitest'
import {
  applyExclusiveSlots,
  buildExclusiveSlotPlan,
  type ExclusiveSlotSnapshot,
} from './petSpineSlots'

const cupidLike: ExclusiveSlotSnapshot = {
  idleAnimation: 'idle',
  bones: [
    { name: 'root', parent: null },
    { name: 'bone', parent: 'root' },
    { name: 'body_1', parent: 'bone' },
    { name: 'head_1', parent: 'bone' },
    { name: 'forehead_1', parent: 'head_1' },
    { name: 'shadow', parent: 'root' },
    { name: '骨骼', parent: 'root' },
    { name: '骨骼2', parent: '骨骼' },
    { name: 'eat_root', parent: 'root' },
    { name: 'eat_hand', parent: 'eat_root' },
  ],
  slots: [
    { name: 'body_1', bone: 'body_1', attachmentName: 'body_1' },
    { name: 'head_1', bone: 'head_1', attachmentName: 'head_1' },
    { name: 'forehead_1', bone: 'forehead_1', attachmentName: 'forehead_1' },
    { name: 'shadow', bone: 'shadow', attachmentName: 'shadow' },
    { name: 'zhentou', bone: '骨骼', attachmentName: 'zhentou' },
    { name: 'tou', bone: '骨骼', attachmentName: 'tou' },
    { name: 'food', bone: 'eat_root', attachmentName: 'food' },
  ],
  animationBones: {
    idle: ['body_1', 'head_1'],
    run: ['body_1', 'head_1', 'shadow'],
    shuijiao: ['骨骼2'],
    eat: ['eat_hand'],
  },
}

function createSkeleton(planSlots: ExclusiveSlotSnapshot['slots']) {
  const attachments = new Map<string, string | null>()
  const slots = planSlots.map((slot) => {
    attachments.set(slot.name, slot.attachmentName ?? null)
    return {
      data: { name: slot.name, attachmentName: slot.attachmentName ?? null, boneName: slot.bone },
    }
  })
  return {
    slots,
    attachments,
    setAttachment(slotName: string, attachmentName?: string | null) {
      attachments.set(slotName, attachmentName ?? null)
    },
  }
}

describe('exclusive animation slots', () => {
  it('treats setup-visible props on a non-idle bone tree as exclusive to that animation', () => {
    const plan = buildExclusiveSlotPlan(cupidLike)
    expect(plan.exclusiveSlots.map((slot) => slot.slotName).sort()).toEqual(['food', 'tou', 'zhentou'])
    expect(plan.exclusiveSlots.find((slot) => slot.slotName === 'zhentou')?.animationNames).toEqual(['shuijiao'])
    expect(plan.exclusiveSlots.find((slot) => slot.slotName === 'food')?.animationNames).toEqual(['eat'])
  })

  it('hides exclusive props during idle and keeps the standing body', () => {
    const plan = buildExclusiveSlotPlan(cupidLike)
    const skeleton = createSkeleton(cupidLike.slots)
    applyExclusiveSlots(skeleton, plan, 'idle')
    expect(skeleton.attachments.get('zhentou')).toBeNull()
    expect(skeleton.attachments.get('food')).toBeNull()
    expect(skeleton.attachments.get('body_1')).toBe('body_1')
    expect(skeleton.attachments.get('forehead_1')).toBe('forehead_1')
    expect(skeleton.attachments.get('shadow')).toBe('shadow')
  })

  it('shows sleep props and hides standing body during shuijiao', () => {
    const plan = buildExclusiveSlotPlan(cupidLike)
    const skeleton = createSkeleton(cupidLike.slots)
    applyExclusiveSlots(skeleton, plan, 'shuijiao')
    expect(skeleton.attachments.get('zhentou')).toBe('zhentou')
    expect(skeleton.attachments.get('tou')).toBe('tou')
    expect(skeleton.attachments.get('food')).toBeNull()
    expect(skeleton.attachments.get('body_1')).toBeNull()
    expect(skeleton.attachments.get('head_1')).toBeNull()
  })

  it('shows a newly added exclusive action without extra slot name lists', () => {
    const plan = buildExclusiveSlotPlan(cupidLike)
    const skeleton = createSkeleton(cupidLike.slots)
    applyExclusiveSlots(skeleton, plan, 'eat')
    expect(skeleton.attachments.get('food')).toBe('food')
    expect(skeleton.attachments.get('zhentou')).toBeNull()
    expect(skeleton.attachments.get('body_1')).toBeNull()
  })
})
