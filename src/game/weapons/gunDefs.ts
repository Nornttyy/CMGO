// 枪械数据表（数值全部来自《无畏契约》国服官方武器库 valm.qq.com，取近距离伤害）。蛋蛋 100 血。
// 所有枪模型都来自 Quaternius「Ultimate Guns Pack」(CC0)，同一套→朝向统一。
export interface GunDef {
  id: string;
  name: string;        // 中文名(国服)
  model: string;       // GLB 路径
  mag: number;         // 弹匣
  reserve: number;     // 备弹
  fireCd: number;      // 两发间隔(秒) = 1/射速
  bodyDmg: number;     // 身体伤害(散弹枪=每颗弹丸)
  headDmg: number;     // 爆头伤害(散弹枪=每颗弹丸)
  auto: boolean;       // 是否全自动(按住连发)
  price: number;       // 商店价格
  baseSpread: number;  // 基础散布(腰射准度)，越小越准
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
    mag: 12, reserve: 36, fireCd: 0.148, bodyDmg: 26, headDmg: 78, auto: false, price: 0,
    baseSpread: 0.009, altBurst: true,
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'shorty', name: '短炮', model: 'models/weapons/shotgun.glb',
    mag: 2, reserve: 8, fireCd: 0.333, bodyDmg: 11, headDmg: 22, auto: false, price: 150,
    baseSpread: 0.012, pellets: 12, pelletSpread: 0.06,
    view: { pos: [0.3, -0.33, -0.7], rotY: ROT, size: 0.62, muzzleZ: -0.74 },
  },
  {
    id: 'frenzy', name: '狂怒', model: 'models/weapons/pistol2.glb',
    mag: 15, reserve: 45, fireCd: 0.1, bodyDmg: 26, headDmg: 78, auto: true, price: 450,
    baseSpread: 0.011,
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'ghost', name: '鬼魅', model: 'models/weapons/pistol3.glb',
    mag: 13, reserve: 39, fireCd: 0.148, bodyDmg: 30, headDmg: 105, auto: false, price: 500,
    baseSpread: 0.007,
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
  {
    id: 'hunter', name: '追猎', model: 'models/weapons/pistol4.glb',
    mag: 8, reserve: 24, fireCd: 0.196, bodyDmg: 39, headDmg: 152, auto: false, price: 600,
    baseSpread: 0.0065,
    view: { pos: P, rotY: ROT, size: 0.52, muzzleZ: -0.64 },
  },
  {
    id: 'sheriff', name: '正义', model: 'models/weapons/sheriff.glb',
    mag: 6, reserve: 18, fireCd: 0.25, bodyDmg: 55, headDmg: 159, auto: false, price: 800,
    baseSpread: 0.006,
    view: { pos: P, rotY: ROT, size: 0.5, muzzleZ: -0.62 },
  },
];

export const GUN_BY_ID: Record<string, GunDef> = Object.fromEntries(GUNS.map((g) => [g.id, g]));
