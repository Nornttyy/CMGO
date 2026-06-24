import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box } from '../physics/aabb';
import { vec3 } from '../core/vec3';

// 加载、缓存、克隆 Kenney 卡通模型（GLB），并提供"贴地 + 配碰撞盒"的摆放工具。
// 这是地图"绝不穿模"的核心：每个模型都贴地、实心物都配和它一样大的碰撞盒。

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Group>(); // url -> 原始场景（每个文件只加载一次）

function fullUrl(url: string): string {
  return import.meta.env.BASE_URL + url; // 兼容本地(/)与 GitHub Pages(/CMGO/)
}

// 预加载一批模型（进游戏前调用一次）。url 形如 'models/kenney/survival/box.glb'
export async function preloadModels(urls: string[]): Promise<void> {
  await Promise.all(urls.map((u) => loadOne(u)));
}

async function loadOne(url: string): Promise<THREE.Group> {
  const hit = cache.get(url);
  if (hit) return hit;
  const gltf = await loader.loadAsync(fullUrl(url));
  const root = gltf.scene;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  cache.set(url, root);
  return root;
}

// 取一个已预加载模型的克隆实例（几何/材质共享，省内存）。必须先 preloadModels。
export function instance(url: string): THREE.Group {
  const root = cache.get(url);
  if (!root) throw new Error('模型未预加载: ' + url);
  return root.clone(true);
}

export interface Placed {
  group: THREE.Group;
  box?: Box; // 碰撞盒（实心物才有，给玩家碰撞用）
}

export interface PlaceOpts {
  rotY?: number;     // 绕 Y 轴旋转（弧度）
  scale?: number;    // 整体缩放（默认 1）
  solid?: boolean;   // true：生成碰撞盒（默认用真实包围盒的水平footprint）
  collide?: { hx: number; hz: number }; // 自定义碰撞半尺寸（如树只挡树干，不挡树冠）
}

// 把模型放到 (x,z)，贴地（底面正好 y=0），可旋转/缩放；solid 时生成与之匹配的碰撞盒。
// 防穿模：贴地与碰撞盒都基于"真实包围盒"计算，所见即所挡。
export function placeOnGround(url: string, x: number, z: number, opts: PlaceOpts = {}): Placed {
  const g = instance(url);
  g.scale.setScalar(opts.scale ?? 1);
  g.rotation.y = opts.rotY ?? 0;
  g.position.set(x, 0, z);
  g.updateMatrixWorld(true);

  // 求世界包围盒，把底面挪到 y=0（贴地，不陷不浮）
  const bb = new THREE.Box3().setFromObject(g);
  g.position.y -= bb.min.y;
  g.updateMatrixWorld(true);

  let box: Box | undefined;
  if (opts.solid || opts.collide) {
    const bb2 = new THREE.Box3().setFromObject(g); // 贴地后的真实包围盒
    if (opts.collide) {
      const cx = (bb2.min.x + bb2.max.x) / 2;
      const cz = (bb2.min.z + bb2.max.z) / 2;
      box = {
        min: vec3(cx - opts.collide.hx, 0, cz - opts.collide.hz),
        max: vec3(cx + opts.collide.hx, bb2.max.y, cz + opts.collide.hz),
      };
    } else {
      box = {
        min: vec3(bb2.min.x, 0, bb2.min.z),
        max: vec3(bb2.max.x, bb2.max.y, bb2.max.z),
      };
    }
  }
  return { group: g, box };
}

// 取已加载模型在指定缩放下的尺寸（宽/高/深），用于摆放时算间距、防重叠。
export function modelSize(url: string, scale = 1): THREE.Vector3 {
  const g = instance(url);
  g.scale.setScalar(scale);
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
}
