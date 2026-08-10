import { TILE_COUNT } from '../config/game'

import { GameState, type SaveSnapshot } from './GameState'

import type { TileState } from '../types/game'

/** localStorage 存储键名。 */
const STORAGE_KEY = 'mountivers.farm.save'

/**
 * 存档管理器：负责游戏状态的持久化与恢复。
 *
 * 使用 localStorage 存储，支持版本号校验与损坏数据容错。
 * 存储介质可注入（默认 window.localStorage），便于测试环境替换。
 */
export class SaveManager {
  private static storage: Storage | null = null

  private constructor() {}

  /** 注入存储介质（测试用）。传 null 恢复默认。 */
  static setStorage(storage: Storage | null): void {
    SaveManager.storage = storage
  }

  /** 获取当前存储介质，默认使用 window.localStorage。 */
  private static getStorage(): Storage {
    return SaveManager.storage ?? window.localStorage
  }

  /** 保存当前状态到 localStorage。 */
  static save(): void {
    const snapshot = GameState.getInstance().toSnapshot()
    SaveManager.getStorage().setItem(STORAGE_KEY, JSON.stringify(snapshot))
  }

  /** 尝试从 localStorage 恢复状态，无存档或数据损坏时返回 false。 */
  static load(): boolean {
    const raw = SaveManager.getStorage().getItem(STORAGE_KEY)
    if (!raw) return false

    try {
      const snapshot = JSON.parse(raw) as SaveSnapshot
      if (!SaveManager.isValid(snapshot)) return false
      GameState.getInstance().fromSnapshot(snapshot)
      return true
    } catch {
      // 数据损坏，忽略并视为无存档
      return false
    }
  }

  /** 清除存档。 */
  static clear(): void {
    SaveManager.getStorage().removeItem(STORAGE_KEY)
  }

  /** 校验存档快照结构是否合法。 */
  private static isValid(snapshot: SaveSnapshot): boolean {
    return (
      typeof snapshot.version === 'number' &&
      typeof snapshot.gold === 'number' &&
      typeof snapshot.diamond === 'number' &&
      typeof snapshot.level === 'number' &&
      typeof snapshot.exp === 'number' &&
      Array.isArray(snapshot.tiles) &&
      snapshot.tiles.length === TILE_COUNT &&
      snapshot.tiles.every(SaveManager.isValidTile)
    )
  }

  /** 校验单个土地格子结构是否合法。 */
  private static isValidTile(tile: TileState): boolean {
    if (typeof tile.tilled !== 'boolean') return false
    if (tile.crop === null) return true
    return (
      typeof tile.crop.cropId === 'number' &&
      typeof tile.crop.elapsedSeconds === 'number' &&
      typeof tile.crop.mature === 'boolean'
    )
  }
}
