// 子弹穿透（纯逻辑，不碰 three.js，好写单测）：
// 射线沿途的每张"命中面"配对成"打进/打出"，按 材质硬度 × 枪的贯穿等级 决定
// 穿不穿、穿了伤害保留多少。多层穿透保留率连乘。

export type Mat = 'plant' | 'wood' | 'low' | 'brick' | 'solid';
export type Pen = 1 | 2 | 3; // 贯穿等级：低/中/高（国服叫"贯穿力"）

export interface HitFace {
  dist: number;      // 距枪口多远(米)
  mat: Mat;          // 这张面的材质
  entering: boolean; // true=打进这面, false=从这面穿出
  objId: number;     // 同一个物体的进/出面共享一个 id
}

export interface ShotResult {
  stopDist: number | null; // 子弹停在几米处；null=没被挡,飞到底
  factor: number;          // 最终伤害保留率(0~1),沿途穿透连乘
  passDists: number[];     // 每个穿入点的距离(留弹孔用)
}

// 材质规则表：[低,中,高] 各档的 最大可穿厚度(米) / 伤害保留率。
// 保留率 0 = 这档打不穿。首版数值(设计单定的基准),试玩后可调。
export const PEN_RULES: Record<Mat, { maxThick: [number, number, number]; keep: [number, number, number] }> = {
  plant: { maxThick: [99, 99, 99], keep: [1, 1, 1] },
  wood:  { maxThick: [2.5, 2.5, 2.5], keep: [0.55, 0.7, 0.8] }, // 2.5：整格木箱(2米)斜穿也放行
  low:   { maxThick: [0, 2.5, 2.5],   keep: [0, 0.55, 0.7] },
  brick: { maxThick: [0, 0, 1.5],  keep: [0, 0, 0.45] },
  solid: { maxThick: [0, 0, 0],    keep: [0, 0, 0] },
};

export function resolveShot(faces: HitFace[], pen: Pen): ShotResult {
  const sorted = [...faces].sort((a, b) => a.dist - b.dist);
  let factor = 1;
  const passDists: number[] = [];
  const passedIds = new Set<number>(); // 已判定穿过的物体：忽略它的"出面"

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    if (!f.entering) { passedIds.delete(f.objId); continue; } // 出面：要么已放行,要么起点在物体内,都跳过

    const rule = PEN_RULES[f.mat];
    const keep = rule.keep[pen - 1];
    // 找同一物体的出面,算穿行厚度；找不到出面(打进不出)按挡停
    const exit = sorted.find((g, j) => j > i && g.objId === f.objId && !g.entering);
    const thickness = exit ? exit.dist - f.dist : Infinity;

    if (keep <= 0 || thickness > rule.maxThick[pen - 1]) {
      return { stopDist: f.dist, factor, passDists }; // 挡停：停在穿入面
    }
    factor *= keep;
    passDists.push(f.dist);
    passedIds.add(f.objId);
  }
  return { stopDist: null, factor, passDists };
}
