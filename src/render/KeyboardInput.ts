import Phaser from 'phaser';
import type { InputCommand, PlayerId } from '../sim/state';
import { screenDirToGrid } from './projection';

/**
 * WASD and arrow keys for one player. Directions are screen-relative: "up"
 * walks up on screen, whatever the view angle.
 */
export class KeyboardInput {
  private readonly up: Phaser.Input.Keyboard.Key[];
  private readonly down: Phaser.Input.Keyboard.Key[];
  private readonly left: Phaser.Input.Keyboard.Key[];
  private readonly right: Phaser.Input.Keyboard.Key[];

  constructor(
    scene: Phaser.Scene,
    private readonly playerId: PlayerId,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is disabled');
    const K = Phaser.Input.Keyboard.KeyCodes;
    const keys = (...codes: number[]): Phaser.Input.Keyboard.Key[] =>
      codes.map((code) => keyboard.addKey(code));
    this.up = keys(K.W, K.UP);
    this.down = keys(K.S, K.DOWN);
    this.left = keys(K.A, K.LEFT);
    this.right = keys(K.D, K.RIGHT);
  }

  /** This player's input for sim tick `tick`, from the keys held right now. */
  command(tick: number): InputCommand {
    const held = (keys: Phaser.Input.Keyboard.Key[]): number =>
      keys.some((k) => k.isDown) ? 1 : 0;
    const screenDir = {
      x: held(this.right) - held(this.left),
      y: held(this.down) - held(this.up),
    };
    return {
      playerId: this.playerId,
      tick,
      move: screenDirToGrid(screenDir),
      interact: false,
      work: false,
    };
  }
}
