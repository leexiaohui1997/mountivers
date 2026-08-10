import { GAME_CONFIG, TILE_COUNT } from '../config/game'

import type { TileState } from '../types/game'

/**
 * 存档快照：GameState 的可序列化形态。
 * 所有字段均为纯数据，可直接 JSON 序列化。
 */
export interface SaveSnapshot {
  readonly version: number
  readonly gold: number
  readonly diamond: number
  readonly level: number
  readonly exp: number
  readonly tiles: readonly TileState[]
}

/**
 * 全局游戏状态单例。
 *
 * 作为运行时数据的唯一来源（Single Source of Truth），
 * 业务系统读写此状态，UI 通过事件订阅刷新。
 * 提供 toSnapshot / fromSnapshot 支持存档与恢复。
 */
export class GameState {
  private static instance: GameState | null = null

  private _gold: number
  private _diamond: number
  private _level: number
  private _exp: number
  private _tiles: TileState[]

  private constructor() {
    this._gold = GAME_CONFIG.initialGold
    this._diamond = GAME_CONFIG.initialDiamond
    this._level = GAME_CONFIG.initialLevel
    this._exp = GAME_CONFIG.initialExp
    this._tiles = Array.from({ length: TILE_COUNT }, () => ({
      tilled: false,
      crop: null,
    }))
  }

  /** 获取全局单例。 */
  static getInstance(): GameState {
    if (!GameState.instance) {
      GameState.instance = new GameState()
    }
    return GameState.instance
  }

  /** 重置为初始状态（新游戏）。 */
  static reset(): void {
    GameState.instance = new GameState()
  }

  get gold(): number {
    return this._gold
  }

  get diamond(): number {
    return this._diamond
  }

  get level(): number {
    return this._level
  }

  get exp(): number {
    return this._exp
  }

  get tiles(): readonly TileState[] {
    return this._tiles
  }

  /** 增加金币，返回是否成功（始终成功）。 */
  addGold(amount: number): void {
    this._gold += amount
  }

  /** 尝试扣除金币，余额不足返回 false。 */
  spendGold(amount: number): boolean {
    if (this._gold < amount) return false
    this._gold -= amount
    return true
  }

  /**
   * 增加经验，返回是否触发升级。
   * 支持一次大量经验连续升级多级，溢出经验保留到下一级。
   */
  addExp(amount: number): boolean {
    this._exp += amount
    let leveledUp = false
    while (this._exp >= this._level * GAME_CONFIG.expPerLevel) {
      this._exp -= this._level * GAME_CONFIG.expPerLevel
      this._level += 1
      leveledUp = true
    }
    return leveledUp
  }

  /** 获取指定土地格子状态。 */
  getTile(index: number): TileState {
    return this._tiles[index]!
  }

  /** 序列化为存档快照。 */
  toSnapshot(): SaveSnapshot {
    return {
      version: 1,
      gold: this._gold,
      diamond: this._diamond,
      level: this._level,
      exp: this._exp,
      tiles: this._tiles.map((tile) => ({
        tilled: tile.tilled,
        crop: tile.crop ? { ...tile.crop } : null,
      })),
    }
  }

  /** 从存档快照恢复状态。 */
  fromSnapshot(snapshot: SaveSnapshot): void {
    this._gold = snapshot.gold
    this._diamond = snapshot.diamond
    this._level = snapshot.level
    this._exp = snapshot.exp
    this._tiles = snapshot.tiles.map((tile) => ({
      tilled: tile.tilled,
      crop: tile.crop ? { ...tile.crop } : null,
    }))
  }
}
