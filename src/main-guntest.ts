// 武器预览页（开发用）：?gun=ghost 看某把枪的第一人称视图，数字键 1~6 快速切枪。
// 每次换新枪模型，先来这里检查朝向/大小/消音器对不对，再进游戏试。
import * as THREE from 'three';
import { GUNS, GUN_BY_ID } from './game/weapons/gunDefs';
import { ViewGun } from './game/weapons/viewGun';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3550);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xbdd4ff, 0x4a4238, 0.9));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(2, 4, 1);
scene.add(sun);

// 远处放个网格地面+参照方块，方便看出枪指向哪
const grid = new THREE.GridHelper(40, 40, 0x557, 0x445);
grid.position.y = -1.6;
scene.add(grid);
const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xcc5533 }));
target.position.set(0, 0, -8);
scene.add(target);

const gun = new ViewGun();
gun.group.visible = true;
camera.add(gun.group);
// 控制台/自动化检查用：window.__vg.group.position.set(...) 可以把枪挪到屏幕中间放大看细节
(window as unknown as { __vg: ViewGun }).__vg = gun;

const tip = document.getElementById('tip') as HTMLElement;
function show(id: string): void {
  const def = GUN_BY_ID[id];
  if (!def) return;
  gun.setGun(def);
  tip.textContent = `${def.name} (${def.id}) — 按 1~${GUNS.length} 切枪`;
}
window.addEventListener('keydown', (e) => {
  const i = Number(e.key) - 1;
  if (GUNS[i]) show(GUNS[i].id);
});
show(new URLSearchParams(location.search).get('gun') ?? 'classic');

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  gun.update(clock.getDelta());
  renderer.render(scene, camera);
});
