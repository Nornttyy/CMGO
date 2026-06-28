// 枪械数据表（数值全部来自《无畏契约》国服官方武器库 valm.qq.com）。蛋蛋 100 血。
// 所有枪模型都来自 Quaternius「Ultimate Guns Pack」(CC0)，同一套→朝向统一。
export interface DmgTier { d: number; body: number; head: number } // d=此档最远距离(米)，超过用下一档
export interface GunDef {
  id: string;
  name: string;        // 中文名(国服)
  model: string;       // GLB 路径
  mag: number;         // 弹匣
  reserve: number;     // 备弹
  fireCd: number;      // 两发间隔(秒) = 1/射速
  bodyDmg: number;     // 近距身体伤害(=ranges[0].body，做商店显示/兜底；散弹枪=每颗弹丸)
  headDmg: number;     // 近距爆头伤害
  ranges: DmgTier[];   // 分距离伤害(近→远)
  auto: boolean;       // 是否全自动(按住连发)
  price: number;       // 商店价格
  altBurst?: boolean;  // 右键三连发(标配专属)
  pellets?: number;    // 散弹枪：一枪打几颗弹丸(默认1)
  pelletSpread?: number; // 散弹枪：弹丸散开的锥角
  // 第一人称视图摆放：位置 / 朝向(绕Y) / 缩放到的大小 / 枪口在前方多远(放火光&拖尾起点)
  view: { pos: [number, number, number]; rotY: number; size: number; muzzleZ: number };
}

const ROT = Math.PI / 2 - 0.16; // 这套包的枪默认枪管朝 +X，转过来朝前
const P: [number, number, number] = [0.3, -0.34, -0.68]; // 手枪通用摆放

export const GUNS: GunDef[] = [
  {
    id: 'classic', name: '标配', model: 'models/weapons/pistol.glb',
    mag: 12, reserve: 36, fireCd: 0.148, bodyDmg: 26, headDmg: 78, auto: false, price: 0, altBurst: true,
    ranges: [{ d: 20, body: 26, head: 78 }, { d: 999, body: 22, head: 66 }],
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'shorty', name: '短炮', model: 'models/weapons/shotgun.glb',
    mag: 2, reserve: 8, fireCd: 0.333, bodyDmg: 11, headDmg: 22, auto: false, price: 150,
    pellets: 12, pelletSpread: 0.06,
    ranges: [{ d: 7, body: 11, head: 22 }, { d: 15, body: 6, head: 12 }, { d: 999, body: 3, head: 6 }],
    view: { pos: [0.3, -0.33, -0.7], rotY: ROT, size: 0.62, muzzleZ: -0.74 },
  },
  {
    id: 'frenzy', name: '狂怒', model: 'models/weapons/pistol2.glb',
    mag: 15, reserve: 45, fireCd: 0.1, bodyDmg: 26, headDmg: 78, auto: true, price: 450,
    ranges: [{ d: 20, body: 26, head: 78 }, { d: 999, body: 21, head: 63 }],
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'ghost', name: '鬼魅', model: 'models/weapons/pistol3.glb',
    mag: 13, reserve: 39, fireCd: 0.148, bodyDmg: 30, headDmg: 105, auto: false, price: 500,
    ranges: [{ d: 30, body: 30, head: 105 }, { d: 999, body: 25, head: 87 }],
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'hunter', name: '追猎', model: 'models/weapons/pistol4.glb',
    mag: 8, reserve: 24, fireCd: 0.196, bodyDmg: 39, headDmg: 152, auto: false, price: 600,
    ranges: [{ d: 10, body: 39, head: 152 }, { d: 30, body: 39, head: 128 }, { d: 999, body: 34, head: 112 }],
    view: { pos: P, rotY: ROT, size: 0.52, muzzleZ: -0.64 },
  },
  {
    id: 'sheriff', name: '正义', model: 'models/weapons/sheriff.glb',
    mag: 6, reserve: 18, fireCd: 0.25, bodyDmg: 55, headDmg: 159, auto: false, price: 800,
    ranges: [{ d: 30, body: 55, head: 159 }, { d: 999, body: 50, head: 145 }],
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
];

export const GUN_BY_ID: Record<string, GunDef> = Object.fromEntries(GUNS.map((g) => [g.id, g]));

// 按命中距离取伤害(近距离满伤，越远越低)。head=true 取爆头档。
export function dmgAt(def: GunDef, dist: number, head: boolean): number {
  for (const t of def.ranges) if (dist <= t.d) return head ? t.head : t.body;
  const last = def.ranges[def.ranges.length - 1];
  return head ? last.head : last.body;
}
