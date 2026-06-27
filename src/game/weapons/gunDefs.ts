// 枪械数据表（参考《无畏契约》数值/手感）。蛋蛋 100 血。
export interface GunDef {
  id: string;
  name: string;        // 中文名(国服)
  model: string;       // GLB 路径
  mag: number;         // 弹匣
  reserve: number;     // 备弹
  fireCd: number;      // 两发间隔(秒)
  bodyDmg: number;     // 身体伤害
  headDmg: number;     // 爆头伤害
  auto: boolean;       // 是否全自动(按住连发)
  price: number;       // 商店价格
  altBurst?: boolean;  // 右键三连发(标配专属)
  // 第一人称视图摆放：位置 / 朝向(绕Y) / 缩放到的大小 / 枪口在前方多远(放火光&拖尾起点)
  view: { pos: [number, number, number]; rotY: number; size: number; muzzleZ: number };
}

const ROT = Math.PI / 2 - 0.16; // Quaternius 枪默认枪管朝 +X，转过来朝前

export const GUNS: GunDef[] = [
  {
    id: 'classic', name: '标配', model: 'models/weapons/pistol.glb',
    mag: 12, reserve: 36, fireCd: 0.148, bodyDmg: 26, headDmg: 78, auto: false, price: 0, altBurst: true,
    view: { pos: [0.3, -0.34, -0.68], rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'ghost', name: '鬼魅', model: 'models/weapons/ghost.glb',
    mag: 15, reserve: 45, fireCd: 0.13, bodyDmg: 30, headDmg: 105, auto: false, price: 500,
    view: { pos: [0.3, -0.34, -0.68], rotY: ROT, size: 0.52, muzzleZ: -0.62 },
  },
  {
    id: 'frenzy', name: '狂怒', model: 'models/weapons/frenzy.glb',
    mag: 13, reserve: 39, fireCd: 0.1, bodyDmg: 26, headDmg: 78, auto: true, price: 450,
    view: { pos: [0.3, -0.34, -0.68], rotY: ROT, size: 0.52, muzzleZ: -0.62 },
  },
  {
    id: 'stinger', name: '短跑', model: 'models/weapons/smg.glb',
    mag: 20, reserve: 60, fireCd: 0.08, bodyDmg: 27, headDmg: 67, auto: true, price: 1000,
    view: { pos: [0.3, -0.32, -0.7], rotY: ROT, size: 0.66, muzzleZ: -0.8 },
  },
  {
    id: 'marshal', name: '追猎', model: 'models/weapons/sniper.glb',
    mag: 5, reserve: 15, fireCd: 0.6, bodyDmg: 90, headDmg: 200, auto: false, price: 950,
    view: { pos: [0.32, -0.3, -0.72], rotY: ROT, size: 0.95, muzzleZ: -1.1 },
  },
  {
    id: 'sheriff', name: '正义', model: 'models/weapons/sheriff.glb',
    mag: 6, reserve: 18, fireCd: 0.4, bodyDmg: 55, headDmg: 159, auto: false, price: 800,
    view: { pos: [0.3, -0.34, -0.68], rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
];

export const GUN_BY_ID: Record<string, GunDef> = Object.fromEntries(GUNS.map((g) => [g.id, g]));
