import { createRenderer } from './game/engine/scene';
import { MapEditor, Brush } from './game/editor/mapEditor';

// 独立的"地图编辑器"网页：只跑编辑器。做好点"试玩"会存盘并跳回游戏页玩这张图。
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const editor = new MapEditor(renderer, canvas);
editor.enable();

const status = document.getElementById('ed-status');
let statusTimer = 0;
function toast(msg: string): void {
  if (!status) return;
  status.textContent = msg;
  status.style.opacity = '1';
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => { status.style.opacity = '0'; }, 1400);
}

// 选放什么
document.querySelectorAll('.ed-brush').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.ed-brush').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  editor.setBrush((b as HTMLElement).dataset.brush as Brush);
}));

// 旋转 + 高/长/宽
const edReadout = document.getElementById('ed-readout');
editor.onInfo = (s: string) => { if (edReadout) edReadout.textContent = s; };
document.getElementById('ed-rot')?.addEventListener('click', () => editor.rotateBrush());
document.querySelectorAll('.ed-mini[data-dim]').forEach((b) => b.addEventListener('click', () => {
  const el = b as HTMLElement;
  editor.changeSize(el.dataset.dim as 'w' | 'h' | 'd', Number(el.dataset.delta));
}));
window.addEventListener('keydown', (e) => { if (e.code === 'KeyR') editor.rotateBrush(); });

// 动作：清空 / 保存 / 试玩
document.getElementById('ed-clear')?.addEventListener('click', () => { editor.clear(); toast('已清空'); });
document.getElementById('ed-save')?.addEventListener('click', () => { editor.save(); toast('已保存，回游戏就能玩到'); });
document.getElementById('ed-play')?.addEventListener('click', () => {
  editor.save();
  try { sessionStorage.setItem('cmgo_autoplay', '1'); } catch { /* ignore */ }
  location.href = './index.html'; // 跳回游戏页，自动进入玩这张图
});

window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); editor.resize(); });

function loop(): void { editor.update(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
