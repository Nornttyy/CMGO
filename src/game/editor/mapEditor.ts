import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MAP_STORAGE_KEY } from '../world/desertMap';
import { GRID as DEFAULT_GRID } from '../world/mapGrid';

// 可视化地图编辑器：鼠标拖动转视角、滚轮放大缩小、左键点地面放模型、橡皮擦点掉。
// 存的时候把摆好的格子变成字母地图(GRID)写进浏览器，游戏直接读它来玩。

const TILE = 5;          // 一格 5 米（和地图解析一致）
const WALL_H = 5;
export type Brush = 'wall' | 'box' | 'house' | 'A' | 'B' | 'spawn' | 'erase';
const CHAR: Record<Exclude<Brush, 'erase'>, string> = { wall: '#', box: 'X', house: 'H', A: 'A', B: 'B', spawn: 'S' };

const SAND = 0xd8c08a, ADOBE = 0xc8a366, ADOBE2 = 0xe0c699, ROOFC = 0x9c6b3f, WOOD = 0xb07a44;

interface Cell { type: Exclude<Brush, 'erase'>; obj: THREE.Object3D; }

export class MapEditor {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private cells = new Map<string, Cell>();
  private brush: Brush = 'wall';
  private ray = new THREE.Raycaster();
  private ground: THREE.Mesh;
  private ghost: THREE.Mesh;
  private enabled = false;
  private downX = 0; private downY = 0; private moved = false;
  private half: number;

  constructor(private renderer: THREE.WebGLRenderer, private canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0xbfe3ff);
    // 光
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
    sun.position.set(60, 90, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
    const s = 200; const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xcfeaff, 0x6a6456, 1.05));

    // 相机 + 轨道控制（拖动转、滚轮缩放）
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 3000);
    this.camera.position.set(0, 150, 170);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495; // 不翻到地底下
    this.controls.minDistance = 20;
    this.controls.maxDistance = 700;
    this.controls.target.set(0, 0, 0);
    this.controls.enabled = false;

    // 大地面 + 网格线（看得清格子）
    const N = 70; const W = N * TILE; this.half = W / 2;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(W, W),
      new THREE.MeshStandardMaterial({ color: SAND, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const grid = new THREE.GridHelper(W, N, 0x7a6a3c, 0xc2b487);
    (grid.material as THREE.Material).opacity = 0.5; (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.02; this.scene.add(grid);

    // 半透明"落点预览"方块
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.4, TILE),
      new THREE.MeshBasicMaterial({ color: 0x4ad9ff, transparent: true, opacity: 0.45 }));
    this.ghost.visible = false; this.scene.add(this.ghost);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
  }

  setBrush(b: Brush): void { this.brush = b; }

  enable(): void {
    this.enabled = true; this.controls.enabled = true;
    if (this.cells.size === 0) this.load(); // 打开时载入上次做的地图
  }
  disable(): void { this.enabled = false; this.controls.enabled = false; this.ghost.visible = false; }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // —— 鼠标 —— 拖动=转视角(OrbitControls)；没拖动的单击=放/擦
  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.downX = e.clientX; this.downY = e.clientY; this.moved = false;
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (Math.abs(e.clientX - this.downX) + Math.abs(e.clientY - this.downY) > 6) this.moved = true;
    const hit = this.groundCell(e.clientX, e.clientY);
    if (hit) { this.ghost.visible = true; this.ghost.position.set(hit.x, 0.2, hit.z); }
    else this.ghost.visible = false;
  };
  private onUp = (e: PointerEvent): void => {
    if (!this.enabled || this.moved) return; // 拖动过=转视角，不放
    if (e.button !== 0) return;              // 只左键放
    const hit = this.groundCell(e.clientX, e.clientY);
    if (hit) this.apply(hit.col, hit.row, hit.x, hit.z);
  };

  // 屏幕坐标 → 地面格子
  private groundCell(clientX: number, clientY: number): { col: number; row: number; x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObject(this.ground);
    if (!hits.length) return null;
    const p = hits[0].point;
    const col = Math.round(p.x / TILE), row = Math.round(p.z / TILE);
    if (Math.abs(col * TILE) > this.half || Math.abs(row * TILE) > this.half) return null;
    return { col, row, x: col * TILE, z: row * TILE };
  }

  private apply(col: number, row: number, x: number, z: number): void {
    const key = col + ',' + row;
    const existing = this.cells.get(key);
    if (existing) { this.scene.remove(existing.obj); this.cells.delete(key); }
    if (this.brush === 'erase') return;
    // 出生点只能有一个
    if (this.brush === 'spawn') {
      for (const [k, c] of this.cells) if (c.type === 'spawn') { this.scene.remove(c.obj); this.cells.delete(k); }
    }
    const obj = makePiece(this.brush, x, z);
    this.scene.add(obj);
    this.cells.set(key, { type: this.brush, obj });
  }

  clear(): void {
    for (const [, c] of this.cells) this.scene.remove(c.obj);
    this.cells.clear();
  }

  // 把摆好的格子变成字母地图(GRID)
  serialize(): string {
    if (this.cells.size === 0) return '';
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const k of this.cells.keys()) {
      const [c, r] = k.split(',').map(Number);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    }
    const W = maxC - minC + 1, H = maxR - minR + 1;
    const grid: string[][] = Array.from({ length: H }, () => Array(W).fill('.'));
    for (const [k, cell] of this.cells) {
      const [c, r] = k.split(',').map(Number);
      grid[r - minR][c - minC] = CHAR[cell.type];
    }
    return grid.map((row) => row.join('')).join('\n');
  }

  save(): void {
    try { localStorage.setItem(MAP_STORAGE_KEY, this.serialize()); } catch { /* ignore */ }
  }

  // 从存档把字母地图读回成可编辑的格子
  load(): void {
    this.clear();
    let txt = '';
    try { txt = localStorage.getItem(MAP_STORAGE_KEY) || ''; } catch { /* ignore */ }
    if (!txt.trim()) txt = DEFAULT_GRID; // 第一次打开：载入起手示例图，让你在上面改
    const rows = txt.split('\n');
    const H = rows.length, W = Math.max(1, ...rows.map((r) => r.length));
    const ox = -Math.floor(W / 2), oz = -Math.floor(H / 2); // 居中到 (0,0) 附近
    for (let r = 0; r < H; r++) for (let c = 0; c < rows[r].length; c++) {
      const t = fromChar(rows[r][c]); if (!t) continue;
      const col = ox + c, row = oz + r;
      const obj = makePiece(t, col * TILE, row * TILE);
      this.scene.add(obj);
      this.cells.set(col + ',' + row, { type: t, obj });
    }
  }

  count(): number { return this.cells.size; }
}

function fromChar(ch: string): Exclude<Brush, 'erase'> | null {
  if ('#▩'.includes(ch)) return 'wall';
  if ('Xx口箱'.includes(ch)) return 'box';
  if ('Hh房'.includes(ch)) return 'house';
  if (ch === 'A') return 'A';
  if (ch === 'B') return 'B';
  if ('Ss生'.includes(ch)) return 'spawn';
  return null;
}

// 一个格子的 3D 模型（编辑器里看得见摸得着）
function makePiece(type: Exclude<Brush, 'erase'>, x: number, z: number): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const mat = (color: number, opacity = 1) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  };
  if (type === 'wall') {
    add(new THREE.BoxGeometry(TILE, WALL_H, TILE), mat(ADOBE), WALL_H / 2);
  } else if (type === 'box') {
    add(new THREE.BoxGeometry(2, 1.7, 2), mat(WOOD), 0.85);
  } else if (type === 'house') {
    add(new THREE.BoxGeometry(TILE * 0.98, 5.2, TILE * 0.98), mat(ADOBE2), 2.6);
    add(new THREE.BoxGeometry(TILE * 1.04, 0.5, TILE * 1.04), mat(ROOFC), 5.45);
  } else if (type === 'A' || type === 'B') {
    const col = type === 'A' ? 0xff5630 : 0x36c5f0;
    add(new THREE.BoxGeometry(TILE * 0.9, 0.2, TILE * 0.9), mat(col, 0.6), 0.12);
    add(new THREE.CylinderGeometry(0.4, 0.4, 5, 12), mat(col, 0.5), 2.6); // 光柱标记
  } else if (type === 'spawn') {
    add(new THREE.CylinderGeometry(TILE * 0.42, TILE * 0.42, 0.2, 20), mat(0x4ad98a, 0.6), 0.12);
    add(new THREE.ConeGeometry(0.8, 1.6, 4), mat(0x2ad07a, 0.85), 1.4); // 出生标
  }
  return g;
}
