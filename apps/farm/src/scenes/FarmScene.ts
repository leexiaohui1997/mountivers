import Phaser from 'phaser'

/**
 * 主场景：当前仅作为骨架验证，后续将承载土地与作物渲染。
 */
export class FarmScene extends Phaser.Scene {
  constructor() {
    super('FarmScene')
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Mountivers Farm', {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
  }
}
