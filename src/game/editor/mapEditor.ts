import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapObj, ObjType, TILE, DEFAULTS, loadObjects, saveObjects } from '../world/mapData';

// 可视化地图编辑器：拖动转视角、滚轮缩放、点地面放模型、橡皮擦点掉。
// 支持：旋转(R 或按钮)、自定义高/长/宽、光幕、匪家/警家两个出生点。

export type Brush = ObjType | 'erase';
const WALL_H = 5;
const SAND = 0xd8c08a, ADOBE = 0xc8a366, ADOBE2 = 0xe0c699, ROOFC = 0x9c6b3f, WOOD = 0xb07a44;
const T_COL = 0xffa030, C_COL = 0x4a90d9; // 匪家橙 / 警家蓝

interface Cell { obj: MapObj; mesh: THREE.Object3D; }

export class MapEditor {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private cells = new Map<string, Cell>();
  private brush: Brush = 'wall';
  private ry = 0;
  private size = { w: 5, h: 5, d: 5 };
  private ray = new THREE.Raycaster();
  private ground: THREE.Mesh;
  private ghost: THREE.Mesh;
  private enabled = false;
  private painting = false; private lastKey = '';
  private half: number;
  onInfo: ((s: string) => void) | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0xbfe3ff);
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
    sun.position.set(12, 110, 18); sun.castShadow = true; // 正上空顶光
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
    const sc = sun.shadow.camera as THREE.OrthographicCamera; const s = 220;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xcfeaff, 0x6a6456, 1.05));

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 3000);
    this.camera.position.set(0, 150, 170);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 20; this.controls.maxDistance = 800;
    this.controls.enabled = false;
    // 左键留给"放/擦"；右键转视角、中键平移、滚轮缩放
    this.controls.mouseButtons.LEFT = null as unknown as THREE.MOUSE;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;

    const N = 80; const W = N * TILE; this.half = W / 2;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshStandardMaterial({ color: SAND, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
    const grid = new THREE.GridHelper(W, N, 0x7a6a3c, 0xc2b487);
    (grid.material as THREE.Material).opacity = 0.45; (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.02; this.scene.add(grid);

    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0x4ad9ff, transparent: true, opacity: 0.4 }));
    this.ghost.visible = false; this.scene.add(this.ghost);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', () => { this.painting = false; });
    this.refreshGhost();
  }

  setBrush(b: Brush): void {
    this.brush = b;
    if (b !== 'erase') { const dft = DEFAULTS[b]; this.size = { w: dft.w, h: dft.h, d: dft.d }; }
    this.refreshGhost(); this.emitInfo();
  }
  rotateBrush(): void { this.ry = (this.ry + Math.PI / 2) % (Math.PI * 2); this.refreshGhost(); this.emitInfo(); }
  changeSize(dim: 'w' | 'h' | 'd', delta: number): void {
    this.size[dim] = Math.max(1, Math.min(40, Math.round(this.size[dim] + delta)));
    this.refreshGhost(); this.emitInfo();
  }
  private emitInfo(): void {
    const arrows = ['↑', '→', '↓', '←'];
    const qi = Math.round(this.ry / (Math.PI / 2)) % 4;
    this.onInfo?.(`高 ${this.size.h} ｜ 长 ${this.size.w} ｜ 宽 ${this.size.d} ｜ 朝向 ${arrows[qi]}`);
  }

  enable(): void { this.enabled = true; this.controls.enabled = true; if (this.cells.size === 0) this.load(); this.emitInfo(); }
  disable(): void { this.enabled = false; this.controls.enabled = false; this.ghost.visible = false; }
  resize(): void { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
  update(): void { this.controls.update(); this.renderer.render(this.scene, this.camera); }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || e.button !== 0) return; // 只左键放/擦；右键留给转视角
    this.painting = true; this.lastKey = '';
    const hit = this.groundCell(e.clientX, e.clientY);
    if (hit) { this.apply(hit.col, hit.row, hit.x, hit.z); this.lastKey = hit.col + ',' + hit.row; }
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const hit = this.groundCell(e.clientX, e.clientY);
    if (!hit) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.set(hit.x, this.brush === 'erase' ? 0.3 : this.size.h / 2, hit.z);
    if (this.painting) { // 左键按住拖动 = 连续放
      const key = hit.col + ',' + hit.row;
      if (key !== this.lastKey) { this.apply(hit.col, hit.row, hit.x, hit.z); this.lastKey = key; }
    }
  };
  private onUp = (e: PointerEvent): void => { if (e.button === 0) this.painting = false; };

  private groundCell(clientX: number, clientY: number): { col: number; row: number; x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
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
    if (existing) { this.scene.remove(existing.mesh); this.cells.delete(key); }
    if (this.brush === 'erase') return;
    if (this.brush === 'spawnT' || this.brush === 'spawnC') {
      for (const [k, c] of this.cells) if (c.obj.t === this.brush) { this.scene.remove(c.mesh); this.cells.delete(k); }
    }
    const obj: MapObj = { t: this.brush, x, z, ry: this.ry, w: this.size.w, h: this.size.h, d: this.size.d };
    const mesh = objToMesh(obj);
    this.scene.add(mesh);
    this.cells.set(key, { obj, mesh });
  }

  clear(): void { for (const [, c] of this.cells) this.scene.remove(c.mesh); this.cells.clear(); }

  private refreshGhost(): void {
    this.ghost.geometry.dispose();
    this.ghost.geometry = new THREE.BoxGeometry(this.size.w, this.brush === 'erase' ? 0.6 : this.size.h, this.size.d);
    this.ghost.rotation.y = this.ry;
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(this.brush === 'erase' ? 0xff5630 : 0x4ad9ff);
  }

  serialize(): MapObj[] { return [...this.cells.values()].map((c) => c.obj); }
  save(): void { saveObjects(this.serialize()); }

  load(): void {
    this.clear();
    const objs = loadObjects();
    for (const o of objs) {
      const col = Math.round(o.x / TILE), row = Math.round(o.z / TILE);
      const mesh = objToMesh(o); this.scene.add(mesh);
      this.cells.set(col + ',' + row, { obj: o, mesh });
    }
  }
}

// 一个对象的可视模型（编辑器里看得见，按大小+朝向）
function objToMesh(o: MapObj): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z); g.rotation.y = o.ry;
  const m = (color: number, op = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: op < 1, opacity: op });
  const add = (geo: THREE.BufferGeometry, mtl: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geo, mtl); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  };
  if (o.t === 'wall') add(new THREE.BoxGeometry(o.w, o.h, o.d), m(ADOBE), o.h / 2);
  else if (o.t === 'box') add(new THREE.BoxGeometry(o.w, o.h, o.d), m(WOOD), o.h / 2);
  else if (o.t === 'house') {
    add(new THREE.BoxGeometry(o.w, o.h, o.d), m(ADOBE2), o.h / 2);
    add(new THREE.BoxGeometry(o.w + 0.6, 0.5, o.d + 0.6), m(ROOFC), o.h + 0.25);
  } else if (o.t === 'barrier') {
    add(new THREE.BoxGeometry(o.w, o.h, o.d), new THREE.MeshStandardMaterial({ color: 0x4ad9ff, emissive: 0x2aa8d8, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), o.h / 2);
  } else if (o.t === 'A' || o.t === 'B') {
    const col = o.t === 'A' ? 0xff5630 : 0x36c5f0;
    add(new THREE.BoxGeometry(o.w, 0.2, o.d), m(col, 0.6), 0.12);
    add(new THREE.CylinderGeometry(0.4, 0.4, 5, 12), m(col, 0.5), 2.6);
  } else if (o.t === 'spawnT' || o.t === 'spawnC') {
    const col = o.t === 'spawnT' ? T_COL : C_COL;
    add(new THREE.CylinderGeometry(o.w * 0.5, o.w * 0.5, 0.2, 20), m(col, 0.6), 0.12);
    add(new THREE.ConeGeometry(0.9, 1.8, 4), m(col, 0.9), 1.5);
  }
  void WALL_H;
  return g;
}
