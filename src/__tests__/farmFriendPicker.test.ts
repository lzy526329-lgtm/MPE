import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderFarmFriendPicker, renderFarmPlotBadges } from '../farmPage'

describe('farm friend picker', () => {
  it('renders friends with presence and an enter action inside the farm page', () => {
    const html = renderFarmFriendPicker({
      friends: [
        { id: 7, uid: '123456789', nickname: '小明', remark: '同事' },
        { id: 8, uid: '987654321', nickname: '小红' },
      ],
      onlineUserIds: [7],
      loading: false,
      message: null,
    })
    expect(html).toContain('好友农场')
    expect(html).toContain('小明')
    expect(html).toContain('同事')
    expect(html).toContain('好友在线')
    expect(html).toContain('好友离线')
    expect(html).toContain('data-farm-friend-id="7"')
  })

  it('renders loading and empty states', () => {
    expect(renderFarmFriendPicker({ friends: [], onlineUserIds: [], loading: true, message: null })).toContain('加载好友中')
    expect(renderFarmFriendPicker({ friends: [], onlineUserIds: [], loading: false, message: null })).toContain('还没有好友')
  })

  it('filters by nickname, remark, or uid and puts online friends first', () => {
    const html = renderFarmFriendPicker({
      friends: [
        { id: 8, uid: '987654321', nickname: '小红' },
        { id: 7, uid: '123456789', nickname: '小明', remark: '同事' },
      ],
      onlineUserIds: [7],
      loading: false,
      message: null,
      query: '同事',
    })
    expect(html.indexOf('data-farm-friend-id="7"')).toBeGreaterThan(-1)
    expect(html).not.toContain('data-farm-friend-id="8"')
    expect(html).toContain('搜索昵称、备注或 UID')
  })

  it('shows the steal action above the ready badge only for stealable plots', () => {
    const stealable = renderFarmPlotBadges('ready', true, false)
    expect(stealable).toContain('偷取')
    expect(stealable.indexOf('偷取')).toBeLessThan(stealable.indexOf('熟'))

    const stolen = renderFarmPlotBadges('ready', true, true)
    expect(stolen).not.toContain('偷取')
    expect(stolen).not.toContain('已收获')
    expect(renderFarmPlotBadges('growing', true, false)).not.toContain('偷取')
  })

  it('anchors the steal badge above the ready badge without shifting it', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.farm-plot-badges--stealable\s*\{[^}]*gap:\s*0/s)
    expect(css).toMatch(/\.farm-plot-badge--steal\s*\{[^}]*position:\s*absolute/s)
  })
})
