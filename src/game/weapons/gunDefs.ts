// 枪械数据表（数值全部来自《无畏契约》国服官方武器库 valm.qq.com）。蛋蛋 100 血。
// 枪模型大多来自 Quaternius「Ultimate Guns Pack」(CC0)；鬼魅=P226、狂怒=Uzi 另有来源(见 CREDITS)。
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
  equipTime: number;   // 装备速度(秒)：抽出这把枪要多久才能开枪(国服官方)
  reloadTime: number;  // 填弹速度(秒)：换一个弹匣要多久(国服官方)
  firstSpreadDeg: number; // 首发弹道偏移(度)：站定开枪的天生误差(国服官方；短炮的4°就是散弹锥角)
  runSpeed: number;    // 持枪跑速(米/秒)：拿着这把枪能跑多快(国服官方)
  altBurst?: boolean;  // 右键三连发(标配专属)
  suppressed?: boolean; // 消音手枪：枪口接黑色消音器(鬼魅)
  pellets?: number;    // 散弹枪：一枪打几颗弹丸(默认1)
  // 第一人称视图摆放：位置 / 朝向(绕Y) / 缩放到的大小 / 枪口在前方多远(放火光&拖尾起点)
  view: { pos: [number, number, number]; rotY: number; size: number; muzzleZ: number };
}

const ROT = Math.PI / 2 - 0.16; // Quaternius 那套包的枪默认枪管朝 +X，转过来朝前
const ROT_FWD = -0.16; // 模型本身已经朝前(-Z)的枪(如 P226)，只保留一点向内斜角
const P: [number, number, number] = [0.3, -0.34, -0.68]; // 手枪通用摆放

export const GUNS: GunDef[] = [
  {
    id: 'classic', name: '标配', model: 'models/weapons/pistol.glb',
    mag: 12, reserve: 36, fireCd: 0.148, bodyDmg: 26, headDmg: 78, auto: false, price: 0, altBurst: true,
    equipTime: 0.75, reloadTime: 1.75, firstSpreadDeg: 0.4, runSpeed: 5.73,
    ranges: [{ d: 20, body: 26, head: 78 }, { d: 999, body: 22, head: 66 }],
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'shorty', name: '短炮', model: 'models/weapons/shotgun.glb',
    mag: 2, reserve: 8, fireCd: 0.333, bodyDmg: 11, headDmg: 22, auto: false, price: 150,
    equipTime: 0.75, reloadTime: 1.75, firstSpreadDeg: 4, runSpeed: 5.4,
    pellets: 12,
    ranges: [{ d: 7, body: 11, head: 22 }, { d: 15, body: 6, head: 12 }, { d: 999, body: 3, head: 6 }],
    view: { pos: [0.3, -0.33, -0.7], rotY: ROT, size: 0.62, muzzleZ: -0.74 },
  },
  {
    id: 'frenzy', name: '狂怒', model: 'models/weapons/uzi.glb',
    mag: 15, reserve: 45, fireCd: 0.1, bodyDmg: 26, headDmg: 78, auto: true, price: 450,
    equipTime: 1, reloadTime: 1.5, firstSpreadDeg: 0.45, runSpeed: 5.73,
    ranges: [{ d: 20, body: 26, head: 78 }, { d: 999, body: 21, head: 63 }],
    view: { pos: [0.32, -0.36, -0.7], rotY: ROT, size: 0.58, muzzleZ: -0.78 },
  },
  {
    id: 'ghost', name: '鬼魅', model: 'models/weapons/p226.glb',
    mag: 13, reserve: 39, fireCd: 0.148, bodyDmg: 30, headDmg: 105, auto: false, price: 500, suppressed: true,
    equipTime: 0.75, reloadTime: 1.5, firstSpreadDeg: 0.3, runSpeed: 5.73,
    ranges: [{ d: 30, body: 30, head: 105 }, { d: 999, body: 25, head: 87 }],
    view: { pos: P, rotY: ROT_FWD, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'hunter', name: '追猎', model: 'models/weapons/pistol4.glb',
    mag: 8, reserve: 24, fireCd: 0.196, bodyDmg: 39, headDmg: 152, auto: false, price: 600,
    equipTime: 0.75, reloadTime: 1.5, firstSpreadDeg: 0.275, runSpeed: 5.74,
    ranges: [{ d: 10, body: 39, head: 152 }, { d: 30, body: 39, head: 128 }, { d: 999, body: 34, head: 112 }],
    view: { pos: P, rotY: ROT, size: 0.52, muzzleZ: -0.64 },
  },
  {
    id: 'sheriff', name: '正义', model: 'models/weapons/sheriff.glb',
    mag: 6, reserve: 18, fireCd: 0.25, bodyDmg: 55, headDmg: 159, auto: false, price: 800,
    equipTime: 1, reloadTime: 2.25, firstSpreadDeg: 0.25, runSpeed: 5.4,
    ranges: [{ d: 30, body: 55, head: 159 }, { d: 999, body: 50, head: 145 }],
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
];

export const GUN_BY_ID: Record<string, GunDef> = Object.fromEntries(GUNS.map((g) => [g.id, g]));

// 右下角武器栏缩略图用：以"枪管朝 +X"的 Quaternius 系为基准(转0°)，
// 其它朝向的模型(如 P226 本身朝前)算出补偿角，让所有枪在武器栏里角度统一。
export function hudYaw(def: GunDef): number { return def.view.rotY - ROT; }

// 按命中距离取伤害(近距离满伤，越远越低)。head=true 取爆头档。
export function dmgAt(def: GunDef, dist: number, head: boolean): number {
  for (const t of def.ranges) if (dist <= t.d) return head ? t.head : t.body;
  const last = def.ranges[def.ranges.length - 1];
  return head ? last.head : last.body;
}
