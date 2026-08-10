import { beforeEach, describe, expect, it } from 'vitest'

import { GAME_CONFIG, TILE_COUNT } from '../../config/game'
import { EventBus } from '../EventBus'
import { GameState } from '../GameState'
import { SaveManager } from '../SaveManager'

describe('EventBus', () => {
  // 静态监听器累积：每个用例前清理，避免跨用例污染
  beforeEach(() => {
    EventBus.clear()
  })

  it('分发事件并携带载荷', () => {
    const received: number[] = []
    EventBus.on('currencyChanged', ({ gold }) => received.push(gold))
    EventBus.emit('currencyChanged', { gold: 100, diamond: 0 })
    expect(received).toEqual([100])
  })

  it('off 取消订阅后不再触发', () => {
    let count = 0
    const off = EventBus.on('levelChanged', () => {
      count += 1
    })
    off()
    EventBus.emit('levelChanged', { level: 2, exp: 0 })
    expect(count).toBe(0)
  })

  it('once 只触发一次', () => {
    let count = 0
    EventBus.once('saved', () => {
      count += 1
    })
    EventBus.emit('saved', { timestamp: 1 })
    EventBus.emit('saved', { timestamp: 2 })
    expect(count).toBe(1)
  })
})

describe('GameState', () => {
  beforeEach(() => {
    GameState.reset()
  })

  it('初始状态符合配置', () => {
    const state = GameState.getInstance()
    expect(state.gold).toBe(GAME_CONFIG.initialGold)
    expect(state.level).toBe(GAME_CONFIG.initialLevel)
    expect(state.tiles).toHaveLength(TILE_COUNT)
  })

  it('spendGold 余额不足时返回 false', () => {
    const state = GameState.getInstance()
    expect(state.spendGold(state.gold + 1)).toBe(false)
    expect(state.spendGold(state.gold)).toBe(true)
  })

  it('addExp 达到阈值触发升级', () => {
    const state = GameState.getInstance()
    const leveledUp = state.addExp(GAME_CONFIG.expPerLevel)
    expect(leveledUp).toBe(true)
    expect(state.level).toBe(GAME_CONFIG.initialLevel + 1)
    expect(state.exp).toBe(0)
  })

  it('addExp 一次大量经验可连续升级多级并保留溢出', () => {
    const state = GameState.getInstance()
    // 初始 1 级：升到 2 级需 100，升到 3 级需 200，共 300
    // 给 350 → 升到 3 级，剩余 50
    const leveledUp = state.addExp(350)
    expect(leveledUp).toBe(true)
    expect(state.level).toBe(3)
    expect(state.exp).toBe(50)
  })

  it('addExp 经验不足时不升级', () => {
    const state = GameState.getInstance()
    const leveledUp = state.addExp(GAME_CONFIG.expPerLevel - 1)
    expect(leveledUp).toBe(false)
    expect(state.level).toBe(GAME_CONFIG.initialLevel)
    expect(state.exp).toBe(GAME_CONFIG.expPerLevel - 1)
  })

  it('toSnapshot / fromSnapshot 往返一致', () => {
    const state = GameState.getInstance()
    state.addGold(500)
    state.getTile(0).tilled = true
    const snapshot = state.toSnapshot()

    GameState.reset()
    const restored = GameState.getInstance()
    restored.fromSnapshot(snapshot)
    expect(restored.gold).toBe(GAME_CONFIG.initialGold + 500)
    expect(restored.getTile(0).tilled).toBe(true)
  })
})

describe('SaveManager', () => {
  /** 内存版 Storage，替代 window.localStorage 以便在 Node 环境测试。 */
  let mockStorage: Storage

  beforeEach(() => {
    GameState.reset()
    mockStorage = createMemoryStorage()
    SaveManager.setStorage(mockStorage)
  })

  it('save 后 load 可恢复状态', () => {
    const state = GameState.getInstance()
    state.addGold(300)
    SaveManager.save()

    GameState.reset()
    expect(SaveManager.load()).toBe(true)
    expect(GameState.getInstance().gold).toBe(GAME_CONFIG.initialGold + 300)
  })

  it('无存档时 load 返回 false', () => {
    expect(SaveManager.load()).toBe(false)
  })

  it('tiles 长度不符的损坏数据被拒绝', () => {
    const state = GameState.getInstance()
    const snapshot = state.toSnapshot()
    const corrupted = { ...snapshot, tiles: snapshot.tiles.slice(0, 1) }
    mockStorage.setItem('mountivers.farm.save', JSON.stringify(corrupted))

    GameState.reset()
    expect(SaveManager.load()).toBe(false)
  })

  it('tile 元素结构损坏的数据被拒绝', () => {
    const state = GameState.getInstance()
    const snapshot = state.toSnapshot()
    const corrupted = {
      ...snapshot,
      tiles: snapshot.tiles.map((tile) => ({ ...tile, tilled: 'yes' })),
    }
    mockStorage.setItem('mountivers.farm.save', JSON.stringify(corrupted))

    GameState.reset()
    expect(SaveManager.load()).toBe(false)
  })
})

/** 创建一个基于 Map 的内存 Storage 实现。 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}
