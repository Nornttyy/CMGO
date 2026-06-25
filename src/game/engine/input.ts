// 键盘 + 鼠标输入。
// 菜单时 active=false（不接收游戏输入，鼠标可见用来点按钮）；
// 进入游戏后 active=true：移动鼠标转头，按任意键/点击锁定鼠标。
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private dx = 0;
  private dy = 0;
  locked = false;
  active = false;
  slowWalk = false; // 静步开关（按 C 切换）；进入游戏时由外部重置
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const fresh = !this.keys.has(e.code); // 是否刚按下（排除按住时的连发）
      this.keys.add(e.code);
      if (e.code === 'Space') { if (fresh) this.jumpQueued = true; e.preventDefault(); } // 只在真正按下时排队（按住不连发，二段跳要分两次按）
      if (e.code === 'KeyC' && fresh) this.slowWalk = !this.slowWalk; // 按 C 切换静步
      if (e.code !== 'Escape') this.requestLock(); // 按任意键即进入第一人称，不用点击
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousedown', () => { if (this.active) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  private requestLock(): void {
    if (this.locked || document.pointerLockElement) return;
    try {
      const ret = this.canvas.requestPointerLock();
      (ret as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      /* 某些情况需要点击手势，忽略即可 */
    }
  }

  forward(): number {
    return (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
  }
  right(): number {
    return (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
  }
  // 下蹲：Shift（主）或 Ctrl（备用），按哪个都蹲
  get crouch(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
      this.keys.has('ControlLeft') || this.keys.has('ControlRight');
  }

  jumpPressed(): boolean {
    if (this.jumpQueued) { this.jumpQueued = false; return true; }
    return false;
  }
  get jumpHeld(): boolean { return this.keys.has('Space'); } // 跳跃键是否按住（长按大跳用）
  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0; this.dy = 0;
    return r;
  }
}
