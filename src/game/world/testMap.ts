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
  return {
    min: vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    max: vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
  };
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
