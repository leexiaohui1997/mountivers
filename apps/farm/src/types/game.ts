/**
 * 作物生长阶段。
 * 每个阶段对应一种外观与生长进度区间。
 */
export enum CropStage {
  Seed = 'seed',
  Sprout = 'sprout',
  Growing = 'growing',
  Mature = 'mature',
}

/**
 * 作物配置：数据驱动，新增作物只需追加配置，无需改动逻辑。
 */
export interface CropConfig {
  /** 唯一标识 */
  readonly id: number
  /** 显示名称 */
  readonly name: string
  /** 种子购买价格 */
  readonly seedPrice: number
  /** 成熟后出售价格 */
  readonly sellPrice: number
  /** 生长所需游戏秒数 */
  readonly growSeconds: number
  /** 单次收获产量 */
  readonly yield: number
  /** 收获获得经验 */
  readonly exp: number
  /** 解锁所需玩家等级 */
  readonly unlockLevel: number
}

/**
 * 作物实例状态：运行时数据，用于存档与渲染。
 */
export interface CropState {
  cropId: number
  /** 已生长秒数 */
  elapsedSeconds: number
  /** 是否已成熟 */
  mature: boolean
}

/**
 * 土地格子状态。
 */
export interface TileState {
  /** 是否已开垦 */
  tilled: boolean
  /** 当前种植的作物，无则为 null */
  crop: CropState | null
}
