// 键盘 + 鼠标输入。
// 一进来鼠标就隐藏（见 index.html 的 cursor:none）；移动鼠标就能转头（不用点击）；
// 一按任意键或点击，就把鼠标牢牢锁定（无限转圈的顺滑第一人称）。
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private dx = 0;
  private dy = 0;
  locked = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      // 按任意键（Esc 除外）就进入第一人称，不用点击
      if (e.code !== 'Escape') this.requestLock();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousedown', () => this.requestLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });

    // 不管锁没锁定，移动鼠标都转视角（没锁定时也能转，只是会受屏幕边界限制）
    document.addEventListener('mousemove', (e) => {
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  private requestLock(): void {
    if (this.locked || document.pointerLockElement) return;
    try {
      const ret = this.canvas.requestPointerLock();
      // 新浏览器返回 Promise，吞掉可能的拒绝（比如刚按过 Esc 的冷却期）
      (ret as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      /* 某些情况需要明确的点击手势，忽略即可（点击仍可锁定） */
    }
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
