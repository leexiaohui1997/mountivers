import type { CropConfig } from '../types/game'

/**
 * 作物配置目录：数据驱动。
 * 新增作物只需在此追加配置，逻辑层无需改动。
 */
export const CROPS: readonly CropConfig[] = [
  {
    id: 101,
    name: '白萝卜',
    seedPrice: 10,
    sellPrice: 18,
    growSeconds: 20,
    yield: 1,
    exp: 5,
    unlockLevel: 1,
  },
  {
    id: 102,
    name: '胡萝卜',
    seedPrice: 20,
    sellPrice: 38,
    growSeconds: 40,
    yield: 1,
    exp: 8,
    unlockLevel: 2,
  },
  {
    id: 103,
    name: '番茄',
    seedPrice: 40,
    sellPrice: 80,
    growSeconds: 70,
    yield: 2,
    exp: 12,
    unlockLevel: 3,
  },
  {
    id: 104,
    name: '玉米',
    seedPrice: 80,
    sellPrice: 160,
    growSeconds: 110,
    yield: 2,
    exp: 18,
    unlockLevel: 4,
  },
]

/** 按 id 索引作物配置，便于 O(1) 查找。 */
const CROP_BY_ID = new Map(CROPS.map((crop) => [crop.id, crop]))

/** 根据 id 获取作物配置，不存在时返回 undefined。 */
export function getCrop(id: number): CropConfig | undefined {
  return CROP_BY_ID.get(id)
}
