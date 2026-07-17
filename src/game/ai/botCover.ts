import { Box } from '../physics/aabb';
import { blocked } from './steering';
import { losClear } from './botSenses';
import { Pt } from './pathfind';

// 掩体数值（试玩后好调）
export const COVER = {
  OFFSET: 0.7,        // 掩体点离墙面多远
  STEP: 2,            // 沿墙面每隔多远放一个点
  CLEAR_R: 0.45,      // 点自身要留的空隙(不嵌进别的墙)
  MAX_DIST: 10,       // 战斗中只考虑这么近的掩体
  MIN_THREAT_DIST: 6, // 掩体不能离威胁太近
  RETREAT_DIST: 14,   // 撤退掩体要离威胁这么远
  NEAR_LIMIT: 30,     // 每次评估只看最近30个候选(保帧率)
  PEEK_SIDE: 1.2,     // 探头横移距离
  HIDE_MIN: 0.6, HIDE_MAX: 1.2, // 缩在掩体后多久
  EXPOSE_MAX: 1.4,    // 探头最多露多久
};

export interface CoverBounds { minX: number; maxX: number; minZ: number; maxZ: number }

// 启动时一次：沿每面墙(≥0.6m高)四周撒掩体候选点
export function generateCoverPoints(walls: Box[], bounds: CoverBounds): Pt[] {
  const pts: Pt[] = [];
  const push = (x: number, z: number): void => {
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return;
    if (blocked(x, z, walls, COVER.CLEAR_R)) return; // 嵌在别的墙里
    pts.push({ x, z });
  };
  for (const b of walls) {
    if (b.max.y < 0.6) continue; // 矮物挡不住人
    const x0 = b.min.x - COVER.OFFSET, x1 = b.max.x + COVER.OFFSET;
    const z0 = b.min.z - COVER.OFFSET, z1 = b.max.z + COVER.OFFSET;
    for (let x = b.min.x; x <= b.max.x + 1e-3; x += COVER.STEP) { push(x, z0); push(x, z1); }
    for (let z = b.min.z; z <= b.max.z + 1e-3; z += COVER.STEP) { push(x0, z); push(x1, z); }
  }
  return pts;
}

// 按离蛋近排序取前30个逐个验收，返回第一个合格的索引
function pickBy(covers: Pt[], bx: number, bz: number, ok: (p: Pt) => boolean, taken: (i: number) => boolean, maxDist: number): number {
  const near = covers
    .map((p, i) => ({ i, d: Math.hypot(p.x - bx, p.z - bz) }))
    .filter((e) => e.d <= maxDist)
    .sort((a, b) => a.d - b.d)
    .slice(0, COVER.NEAR_LIMIT);
  for (const { i } of near) if (!taken(i) && ok(covers[i])) return i;
  return -1;
}

// 战斗掩体：能挡威胁视线 + 离威胁不太近 + 没被队友占
export function pickCover(covers: Pt[], solids: Box[], bx: number, bz: number, tx: number, tz: number, taken: (i: number) => boolean): number {
  return pickBy(covers, bx, bz, (p) =>
    Math.hypot(p.x - tx, p.z - tz) >= COVER.MIN_THREAT_DIST &&
    !losClear(p.x, p.z, tx, tz, solids), taken, COVER.MAX_DIST);
}

// 撤退掩体：离威胁>14m 且相对蛋在"远离威胁"的方向(可以跑远路)
export function pickRetreatCover(covers: Pt[], solids: Box[], bx: number, bz: number, tx: number, tz: number, taken: (i: number) => boolean): number {
  const tox = tx - bx, toz = tz - bz, tl = Math.hypot(tox, toz) || 1;
  return pickBy(covers, bx, bz, (p) => {
    if (Math.hypot(p.x - tx, p.z - tz) <= COVER.RETREAT_DIST) return false;
    const dx = p.x - bx, dz = p.z - bz, dl = Math.hypot(dx, dz) || 1;
    if ((dx * tox + dz * toz) / (dl * tl) > 0.2) return false; // 别朝威胁跑
    return !losClear(p.x, p.z, tx, tz, solids);
  }, taken, Infinity);
}

// 探头点：从掩体向两侧横移找能看到威胁的位置(打两枪再缩回)
export function peekPoint(cover: Pt, solids: Box[], tx: number, tz: number): Pt | null {
  const dx = tx - cover.x, dz = tz - cover.z, l = Math.hypot(dx, dz) || 1;
  const sx = -dz / l, sz = dx / l; // 垂直于"掩体→威胁"的侧向
  for (const s of [1, -1]) {
    const px = cover.x + sx * COVER.PEEK_SIDE * s, pz = cover.z + sz * COVER.PEEK_SIDE * s;
    if (blocked(px, pz, solids, COVER.CLEAR_R)) continue;
    if (losClear(px, pz, tx, tz, solids)) return { x: px, z: pz };
  }
  return null;
}
