/**
 * 全局游戏常量配置。
 * 集中管理数值参数，便于平衡调整。
 */
export const GAME_CONFIG = {
  /** 初始金币 */
  initialGold: 200,
  /** 初始钻石 */
  initialDiamond: 0,
  /** 初始玩家等级 */
  initialLevel: 1,
  /** 初始经验 */
  initialExp: 0,

  /** 土地网格列数 */
  gridCols: 4,
  /** 土地网格行数 */
  gridRows: 6,
  /** 开垦一块土地所需金币 */
  tillCost: 50,

  /** 升级所需经验公式：level * expPerLevel */
  expPerLevel: 100,

  /** 自动存档间隔（毫秒） */
  autosaveIntervalMs: 60_000,
} as const

/** 土地格子总数。 */
export const TILE_COUNT = GAME_CONFIG.gridCols * GAME_CONFIG.gridRows
