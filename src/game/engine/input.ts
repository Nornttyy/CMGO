// 键盘 + 鼠标（指针锁定）输入。点击画面会锁定鼠标进入第一人称。
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private dx = 0;
  private dy = 0;
  locked = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('click', () => canvas.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  forward(): number {
    return (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
  }
  right(): number {
    return (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
  }
  get sprint(): boolean { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get crouch(): boolean { return this.keys.has('ControlLeft') || this.keys.has('ControlRight'); }

  jumpPressed(): boolean {
    if (this.jumpQueued) { this.jumpQueued = false; return true; }
    return false;
  }
  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0; this.dy = 0;
    return r;
  }
}
