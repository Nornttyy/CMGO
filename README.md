# 爆蛋行动 (CMGO)

一个**卡通风格的网页第一人称射击游戏**——玩法像《CS》（回合制爆破、买枪、护甲），还有像《无畏契约》那样可选的**特工技能**。用 TypeScript + Three.js 制作，打开网页就能玩。

> 🚧 **开发中**：目前完成了**里程碑 1（地基）**——一个能第一人称走 / 跑 / 跳 / 蹲、撞墙被挡、带真实光照和阴影的 3D 世界。蛋蛋特工、枪、地图、机器人等正在路上。

## 🎮 在线试玩

**👉 https://nornttyy.github.io/CMGO/**

**操作**（先点一下画面锁定鼠标）：
- `WASD` 移动 ｜ 鼠标 转头 ｜ `空格` 跳 ｜ `Shift` 跑 ｜ `Ctrl` 蹲

## 💻 本地运行

```bash
npm install
npm run dev      # 开发模式，打开终端里给的网址
npm run build    # 打包到 dist/
npm test         # 单元测试（机器卡时可用 npm run test:fast）
```

## 📐 设计与计划
- 游戏设计单：`docs/superpowers/specs/`
- 开发计划：`docs/superpowers/plans/`

## 🎨 素材
见 [`docs/CREDITS.md`](docs/CREDITS.md)。目前画面由代码生成，暂未使用外部素材。

## 🛠️ 技术
TypeScript · Three.js · Vite · Vitest
