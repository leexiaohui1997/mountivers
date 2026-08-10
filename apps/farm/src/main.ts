import Phaser from 'phaser'

import { FarmScene } from './scenes/FarmScene'

/**
 * 竖屏逻辑分辨率（9:16）。
 * 通过 Scale.FIT 等比缩放并居中，适配不同尺寸的手机屏幕。
 */
const GAME_WIDTH = 540
const GAME_HEIGHT = 960

/**
 * 游戏配置：定义画布尺寸、渲染模式与场景注册。
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#3a7d44',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 移动端优先：统一使用 pointer 事件，兼容触摸与鼠标
  input: {
    activePointers: 3,
  },
  scene: [FarmScene],
}

new Phaser.Game(config)
