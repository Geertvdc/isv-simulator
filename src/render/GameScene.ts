import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.title = this.add
      .text(0, 0, 'ISV Simulator', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        color: '#e6e6e6',
      })
      .setOrigin(0.5);
    this.centerTitle(this.scale.gameSize);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.centerTitle);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.centerTitle);
    });
  }

  private readonly centerTitle = (gameSize: Phaser.Structs.Size): void => {
    this.title.setPosition(gameSize.width / 2, gameSize.height / 2);
  };
}
