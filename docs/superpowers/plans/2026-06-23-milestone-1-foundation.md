# 《爆蛋行动》里程碑 1：能跑能看的 3D 世界 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在浏览器里做出一个第一人称 3D 世界：能走/跑/跳/蹲、用鼠标转头看、撞墙会被挡住，场景有真实光照和阴影，帧率稳定 ≥30fps。

**Architecture:** 用 Vite + TypeScript + Three.js。把"纯逻辑"（向量、移动数学、碰撞）和"Three.js 胶水代码"（渲染、相机、输入）分开：纯逻辑用 Vitest 做 TDD 测试；渲染部分靠 `npm run dev` 跑起来肉眼验证。每个文件只负责一件事。

**Tech Stack:** Vite、TypeScript（strict）、Three.js、Vitest、stats.js。

## Global Constraints

（来自设计单，每个任务都要遵守）
- 平台：网页游戏，TypeScript **strict 模式**开启。
- 引擎：Three.js；构建：Vite；测试：Vitest。
- 画风：卡通但精致 + **真实光照**（太阳光 + 阴影 + ACES 色调映射）。🚫绝不放表情包/梗图。
- 性能：稳定 **≥30fps**（争取 60）；在普通笔记本上测。
- 质量：纯逻辑用 Vitest 测试；**每个任务结束都 commit**；说"做好了"前先真的跑一遍看到效果。
- 素材：本里程碑只用代码生成的简单几何体（地板、方块），暂不下载素材；以后用免费正版素材并在 `docs/CREDITS.md` 记授权。

---

## File Structure

本里程碑会创建这些文件，每个只负责一件事：

- `package.json` / `tsconfig.json` / `vite.config.ts` / `index.html` — 项目配置与入口
- `src/main.ts` — 程序入口：组装引擎、场景、玩家，启动循环
- `src/game/core/vec3.ts` — 纯逻辑：三维向量小工具（可测试）
- `src/game/player/movement.ts` — 纯逻辑：根据输入算移动速度（可测试）
- `src/game/physics/aabb.ts` — 纯逻辑：方块碰撞检测与"推出去"（可测试）
- `src/game/engine/input.ts` — 键盘 + 鼠标（指针锁定）输入
- `src/game/engine/scene.ts` — Three.js 渲染器、相机、灯光、阴影、色调映射
- `src/game/world/testMap.ts` — 测试场景：地板 + 几个方块掩体（含碰撞盒）
- `src/game/player/playerController.ts` — 把输入+移动+碰撞+相机接到一起的第一人称控制器
- `tests/vec3.test.ts` / `tests/movement.test.ts` / `tests/aabb.test.ts` — 单元测试

---

### Task 1: 项目骨架（能跑出一个发光的旋转方块）

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: 一个能 `npm run dev` 打开网页、看到 Three.js 3D 画面的项目。

- [ ] **Step 1: 初始化 npm 并安装依赖**

Run:
```bash
cd /workspace/CMGO
npm init -y
npm install three
npm install -D vite typescript @types/three vitest stats.js @types/stats.js
```
Expected: 生成 `node_modules/` 与 `package-lock.json`，无报错。

- [ ] **Step 2: 写 `.gitignore`**

```gitignore
node_modules/
dist/
*.local
.DS_Store
```

- [ ] **Step 3: 写 `package.json` 的 scripts**（替换 `"scripts"` 字段）

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: 写 `vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 6: 写 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>爆蛋行动</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; }
      #app { width: 100vw; height: 100vh; display: block; }
    </style>
  </head>
  <body>
    <canvas id="app"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: 写最小 `src/main.ts`（一个发光的旋转方块）**

```ts
import * as THREE from 'three';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1, 4);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xff4444 }),
);
scene.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

- [ ] **Step 8: 跑起来验证**

Run: `npm run dev`
Expected: 终端给出本地网址（如 `http://localhost:5173`）。在浏览器打开，能看到**蓝天背景 + 一个会转的红色方块**。

- [ ] **Step 9: 初始化 git 并提交**

Run:
```bash
cd /workspace/CMGO
git init
git add -A
git commit -m "chore: 搭好 Vite+TS+Three.js 骨架，能渲染一个旋转方块"
```

---

### Task 2: 测试环境 + 三维向量小工具（TDD）

**Files:**
- Create: `src/game/core/vec3.ts`
- Test: `tests/vec3.test.ts`

**Interfaces:**
- Produces: `Vec3` 类型，函数 `vec3(x,y,z)`、`add(a,b)`、`scale(a,s)`、`length(a)`、`normalize(a)`。

- [ ] **Step 1: 写失败的测试 `tests/vec3.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { vec3, add, scale, length, normalize } from '../src/game/core/vec3';

describe('vec3', () => {
  it('相加', () => expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual({ x: 5, y: 7, z: 9 }));
  it('缩放', () => expect(scale(vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 }));
  it('长度', () => expect(length(vec3(3, 4, 0))).toBe(5));
  it('单位化', () => expect(normalize(vec3(0, 0, 5))).toEqual({ x: 0, y: 0, z: 1 }));
  it('零向量单位化返回零', () => expect(normalize(vec3(0, 0, 0))).toEqual({ x: 0, y: 0, z: 0 }));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL（找不到模块 `../src/game/core/vec3`）。

- [ ] **Step 3: 写实现 `src/game/core/vec3.ts`**

```ts
export interface Vec3 { x: number; y: number; z: number; }

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? vec3() : scale(a, 1 / l);
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS（5 个测试全过）。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 加三维向量小工具 vec3（含测试）"
```

---

### Task 3: 移动数学（TDD）

**Files:**
- Create: `src/game/player/movement.ts`
- Test: `tests/movement.test.ts`

**Interfaces:**
- Consumes: `Vec3`、`normalize`、`scale`（来自 Task 2）。
- Produces: 常量 `WALK_SPEED=5`、`SPRINT_SPEED=8`；函数 `horizontalVelocity(input: MoveInput, yaw: number): Vec3`，其中 `MoveInput = { forward: number; right: number; sprint: boolean }`。`yaw` 为弧度，`yaw=0` 时"向前"对应世界 -Z 方向。

- [ ] **Step 1: 写失败的测试 `tests/movement.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { horizontalVelocity, WALK_SPEED, SPRINT_SPEED } from '../src/game/player/movement';
import { length } from '../src/game/core/vec3';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('horizontalVelocity', () => {
  it('没有输入时速度为 0', () => {
    expect(horizontalVelocity({ forward: 0, right: 0, sprint: false }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('yaw=0 向前 = -Z 方向，速度为走路速度', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, sprint: false }, 0);
    expect(near(v.x, 0)).toBe(true);
    expect(near(v.z, -WALK_SPEED)).toBe(true);
  });
  it('yaw=0 向右 = +X 方向', () => {
    const v = horizontalVelocity({ forward: 0, right: 1, sprint: false }, 0);
    expect(near(v.x, WALK_SPEED)).toBe(true);
    expect(near(v.z, 0)).toBe(true);
  });
  it('斜着走不会更快（仍是走路速度）', () => {
    const v = horizontalVelocity({ forward: 1, right: 1, sprint: false }, 0);
    expect(near(length(v), WALK_SPEED)).toBe(true);
  });
  it('冲刺时用冲刺速度', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, sprint: true }, 0);
    expect(near(length(v), SPRINT_SPEED)).toBe(true);
  });
  it('转向后速度大小不变', () => {
    const v = horizontalVelocity({ forward: 1, right: 0, sprint: false }, Math.PI / 2);
    expect(near(length(v), WALK_SPEED)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL（找不到模块 `../src/game/player/movement`）。

- [ ] **Step 3: 写实现 `src/game/player/movement.ts`**

```ts
import { Vec3, vec3, normalize, scale } from '../core/vec3';

export const WALK_SPEED = 5;
export const SPRINT_SPEED = 8;

export interface MoveInput {
  forward: number; // -1..1（W=+1, S=-1）
  right: number;   // -1..1（D=+1, A=-1）
  sprint: boolean;
}

// yaw=0 时向前对应世界 -Z。绕 Y 轴旋转后大小不变。
export function horizontalVelocity(input: MoveInput, yaw: number): Vec3 {
  const local = vec3(input.right, 0, -input.forward);
  if (local.x === 0 && local.z === 0) return vec3();
  const dir = normalize(local);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // 绕 Y 轴旋转 (x, z)
  const world = vec3(dir.x * cos + dir.z * sin, 0, -dir.x * sin + dir.z * cos);
  const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  return scale(world, speed);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS。若 `转向后速度大小不变` 用例对方向有疑问，方向细节会在 Task 7 手动试玩时再校准；本任务只保证"大小正确、yaw=0 方向正确"。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 加第一人称移动数学 movement（含测试）"
```

---

### Task 4: 方块碰撞（TDD）

**Files:**
- Create: `src/game/physics/aabb.ts`
- Test: `tests/aabb.test.ts`

**Interfaces:**
- Consumes: `Vec3`（来自 Task 2）。
- Produces: 类型 `Box = { min: Vec3; max: Vec3 }`；函数 `aabbFromCenter(center, half): Box`、`overlaps(a, b): boolean`、`resolveCollisions(center: Vec3, half: Vec3, walls: Box[]): Vec3`（返回被"推出墙外"后的新中心点）。

- [ ] **Step 1: 写失败的测试 `tests/aabb.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { overlaps, aabbFromCenter, resolveCollisions, Box } from '../src/game/physics/aabb';
import { vec3 } from '../src/game/core/vec3';

const wall: Box = { min: vec3(0, 0, 0), max: vec3(2, 2, 2) };
const half = vec3(0.5, 0.5, 0.5);

describe('aabb', () => {
  it('重叠判定', () => {
    expect(overlaps(aabbFromCenter(vec3(1, 1, 1), half), wall)).toBe(true);
    expect(overlaps(aabbFromCenter(vec3(5, 5, 5), half), wall)).toBe(false);
  });
  it('没碰到时位置不变', () => {
    expect(resolveCollisions(vec3(5, 1, 1), half, [wall])).toEqual(vec3(5, 1, 1));
  });
  it('从左边插进墙里会被推到墙左边', () => {
    // 中心 x=-0.2，右边缘 0.3 插进了墙（墙 min.x=0）。应被推到 x=-0.5（右边缘正好贴墙）
    const out = resolveCollisions(vec3(-0.2, 1, 1), half, [wall]);
    expect(Math.abs(out.x - -0.5) < 1e-6).toBe(true);
    expect(out.z).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL（找不到模块 `../src/game/physics/aabb`）。

- [ ] **Step 3: 写实现 `src/game/physics/aabb.ts`**

```ts
import { Vec3, vec3 } from '../core/vec3';

export interface Box { min: Vec3; max: Vec3; }

export function aabbFromCenter(center: Vec3, half: Vec3): Box {
  return {
    min: vec3(center.x - half.x, center.y - half.y, center.z - half.z),
    max: vec3(center.x + half.x, center.y + half.y, center.z + half.z),
  };
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

// 把中心点沿"插得最浅"的那个轴推出墙外。返回新的中心点。
export function resolveCollisions(center: Vec3, half: Vec3, walls: Box[]): Vec3 {
  const c = vec3(center.x, center.y, center.z);
  for (const w of walls) {
    const box = aabbFromCenter(c, half);
    if (!overlaps(box, w)) continue;
    const penX = Math.min(box.max.x - w.min.x, w.max.x - box.min.x);
    const penY = Math.min(box.max.y - w.min.y, w.max.y - box.min.y);
    const penZ = Math.min(box.max.z - w.min.z, w.max.z - box.min.z);
    const minPen = Math.min(penX, penY, penZ);
    if (minPen === penX) {
      const mid = (w.min.x + w.max.x) / 2;
      c.x += c.x < mid ? -penX : penX;
    } else if (minPen === penY) {
      const mid = (w.min.y + w.max.y) / 2;
      c.y += c.y < mid ? -penY : penY;
    } else {
      const mid = (w.min.z + w.max.z) / 2;
      c.z += c.z < mid ? -penZ : penZ;
    }
  }
  return c;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 加方块碰撞 aabb（含测试）"
```

---

### Task 5: 输入（键盘 + 鼠标指针锁定）

**Files:**
- Create: `src/game/engine/input.ts`

**Interfaces:**
- Produces: `class Input`，构造参数 `(canvas: HTMLCanvasElement)`；属性/方法：`forward(): number`、`right(): number`、`sprint: boolean`、`crouch: boolean`、`jumpPressed(): boolean`（按一下只触发一次）、`mouseDX: number` / `mouseDY: number`（读一次后清零的鼠标移动量）、`consumeMouse(): {dx,dy}`。点击画面会请求指针锁定。

- [ ] **Step 1: 写实现 `src/game/engine/input.ts`**

```ts
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private dx = 0;
  private dy = 0;
  locked = false;

  constructor(private canvas: HTMLCanvasElement) {
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
```

- [ ] **Step 2: 临时验证（可选）**

在 `src/main.ts` 里临时 `import { Input } from './game/engine/input';` 并 `const input = new Input(canvas);`，在 `animate()` 里 `if (input.jumpPressed()) console.log('jump');`。Run `npm run dev`，点画面后按空格，控制台应打印 `jump`。验证后删掉临时代码。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: 加键盘+鼠标指针锁定输入 input"
```

---

### Task 6: 场景与真实光照（地板 + 掩体方块）

**Files:**
- Create: `src/game/engine/scene.ts`
- Create: `src/game/world/testMap.ts`

**Interfaces:**
- Consumes: `Box`、`vec3`（Task 2/4）。
- Produces:
  - `scene.ts`：`createRenderer(canvas): THREE.WebGLRenderer`（开阴影、ACES 色调映射、限制 pixelRatio≤2）、`createScene(): THREE.Scene`（含太阳平行光+半球光+天空背景）、`onResize(renderer, camera)`。
  - `testMap.ts`：`buildTestMap(scene): Box[]`，往 scene 加地板和几个方块，返回这些方块的碰撞盒数组（含地板盒）。

- [ ] **Step 1: 写 `src/game/engine/scene.ts`**

```ts
import * as THREE from 'three';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3ff);

  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  const s = 30;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x55502f, 0.8));
  return scene;
}

export function onResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
```

- [ ] **Step 2: 写 `src/game/world/testMap.ts`**

```ts
import * as THREE from 'three';
import { Box } from '../physics/aabb';
import { vec3 } from '../core/vec3';

// 加一个方块到场景，并返回它的碰撞盒
function addBox(scene: THREE.Scene, cx: number, cy: number, cz: number,
                sx: number, sy: number, sz: number, color: number): Box {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { min: vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
           max: vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2) };
}

export function buildTestMap(scene: THREE.Scene): Box[] {
  const walls: Box[] = [];
  // 地板（40x40），顶面在 y=0，往下 1 厚
  walls.push(addBox(scene, 0, -0.5, 0, 40, 1, 40, 0xc2b280));
  // 几个掩体方块
  walls.push(addBox(scene, 4, 1, -3, 2, 2, 2, 0x9aa0a6));
  walls.push(addBox(scene, -5, 1.5, -6, 3, 3, 1, 0x9aa0a6));
  walls.push(addBox(scene, 0, 1, -10, 6, 2, 1, 0x9aa0a6));
  walls.push(addBox(scene, -3, 0.75, 2, 1.5, 1.5, 1.5, 0x9aa0a6));
  return walls;
}
```

- [ ] **Step 3: 临时接到 main 验证画面**

临时改 `src/main.ts` 用 `createRenderer/createScene/buildTestMap` + 一个固定相机渲染场景。Run `npm run dev`：应看到**土黄色地板 + 灰色方块 + 阳光下的柔和阴影**，画面通透。验证后进入 Task 7（Task 7 会写正式的 main）。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: 加真实光照场景与测试地图（地板+掩体）"
```

---

### Task 7: 第一人称玩家控制器（走/跑/跳/蹲 + 转头看 + 撞墙）

**Files:**
- Create: `src/game/player/playerController.ts`
- Modify: `src/main.ts`（写成正式入口）

**Interfaces:**
- Consumes: `Input`(Task 5)、`horizontalVelocity`(Task 3)、`resolveCollisions`(Task 4)、`Box`(Task 4)、`createRenderer/createScene/onResize`(Task 6)、`buildTestMap`(Task 6)。
- Produces: `class PlayerController`，构造 `(camera, walls: Box[])`；方法 `update(input: Input, dt: number): void`，每帧更新相机位置与朝向。常量：`GRAVITY=-25`、`JUMP_SPEED=8`、`EYE_HEIGHT=1.6`、`CROUCH_HEIGHT=1.0`，玩家半盒 `half=vec3(0.4, 0.9, 0.4)`。

- [ ] **Step 1: 写 `src/game/player/playerController.ts`**

```ts
import * as THREE from 'three';
import { Input } from '../engine/input';
import { horizontalVelocity } from './movement';
import { resolveCollisions, Box } from '../physics/aabb';
import { Vec3, vec3, add, scale } from '../core/vec3';

const GRAVITY = -25;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.6;
const CROUCH_HEIGHT = 1.0;
const MOUSE_SENSITIVITY = 0.0022;

export class PlayerController {
  private pos: Vec3 = vec3(0, 0.9, 6); // 玩家盒中心（脚在 y=0 时中心约 0.9）
  private velocityY = 0;
  private onGround = false;
  private yaw = 0;
  private pitch = 0;
  private half = vec3(0.4, 0.9, 0.4);

  constructor(private camera: THREE.PerspectiveCamera, private walls: Box[]) {}

  update(input: Input, dt: number): void {
    // 1) 鼠标转头
    const m = input.consumeMouse();
    this.yaw -= m.dx * MOUSE_SENSITIVITY;
    this.pitch -= m.dy * MOUSE_SENSITIVITY;
    const maxPitch = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // 2) 水平移动
    const hv = horizontalVelocity(
      { forward: input.forward(), right: input.right(), sprint: input.sprint },
      this.yaw,
    );

    // 3) 重力与跳跃
    this.velocityY += GRAVITY * dt;
    if (this.onGround && input.jumpPressed()) this.velocityY = JUMP_SPEED;

    // 4) 试探新位置
    const delta = vec3(hv.x * dt, this.velocityY * dt, hv.z * dt);
    const want = add(this.pos, delta);

    // 5) 碰撞推出
    const corrected = resolveCollisions(want, this.half, this.walls);

    // 6) 是否站在地面/方块上（被向上推回来了）
    if (corrected.y > want.y + 1e-5 && this.velocityY <= 0) {
      this.onGround = true;
      this.velocityY = 0;
    } else if (corrected.y < want.y - 1e-5 && this.velocityY > 0) {
      this.velocityY = 0; // 撞到头
      this.onGround = false;
    } else {
      this.onGround = false;
    }
    this.pos = corrected;

    // 7) 更新相机（眼睛高度，蹲下时降低）
    const eye = input.crouch ? CROUCH_HEIGHT : EYE_HEIGHT;
    this.camera.position.set(this.pos.x, this.pos.y - this.half.y + eye, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

// 备注：上面 add/scale 已从 vec3 引入，scale 暂未用到也保留以备扩展。
void scale;
```

- [ ] **Step 2: 写正式 `src/main.ts`**

```ts
import * as THREE from 'three';
import Stats from 'stats.js';
import { createRenderer, createScene, onResize } from './game/engine/scene';
import { buildTestMap } from './game/world/testMap';
import { Input } from './game/engine/input';
import { PlayerController } from './game/player/playerController';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const scene = createScene();
const walls = buildTestMap(scene);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const input = new Input(canvas);
const player = new PlayerController(camera, walls);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

window.addEventListener('resize', () => onResize(renderer, camera));

let last = performance.now();
function animate(now: number) {
  stats.begin();
  const dt = Math.min((now - last) / 1000, 0.05); // 限制最大步长，防卡顿穿墙
  last = now;
  player.update(input, dt);
  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
```

- [ ] **Step 3: 跑起来手动验证（试玩清单）**

Run: `npm run dev`，打开网页，**点一下画面**锁定鼠标，然后逐项试：
- 鼠标移动 → 视角转头（上下有限制，不会翻过头）
- `W/A/S/D` → 前后左右走；`Shift` → 变快（冲刺）
- `Space` → 跳起来后落回地面
- `Ctrl` → 视角降低（蹲下）
- 走向灰色方块/地图边缘的方块 → **被挡住，走不过去**
- 左上角 `stats` 面板 FPS **≥30**（最好 60）
Expected: 以上全部正常。若移动方向感觉反了，调 `movement.ts` 里 `world` 的正负号；若穿墙，检查 `half` 与 `dt` 上限。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: 第一人称控制器，能走跑跳蹲、转头看、撞墙被挡，带FPS显示"
```

---

## 里程碑 1 完成标准（Definition of Done）
- `npm test` 全绿（vec3 / movement / aabb）。
- `npm run dev` 能在浏览器第一人称走动：走/跑/跳/蹲、鼠标转头、撞墙被挡。
- 场景有真实光照与柔和阴影，画面通透。
- 左上 FPS ≥30。
- 全部改动已 commit。

## Self-Review（对照设计单）
- 技术栈 ✓（Vite+TS strict+Three.js+Vitest）
- 真实光照 ✓（平行光+半球光+阴影+ACES）
- ≥30fps ✓（限制 pixelRatio、加 FPS 面板验证）
- 移动手感（走/跑/跳/蹲 + 鼠标看）✓
- 碰撞（撞墙被挡）✓
- 🚫无表情包 ✓（本里程碑无任何贴图/表情）
- 少 bug ✓（纯逻辑 TDD + 试玩清单）
- 下一里程碑预告（不在本计划内）：换上精美卡通模型、加枪与射击、做沙漠小镇地图、爆破玩法、机器人、特工技能。每个各写一份计划。
