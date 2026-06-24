import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022', // 支持顶层 await（main.ts 进场前等模型加载好）
    rollupOptions: {
      input: { // 两个网页：游戏(index) + 独立的地图编辑器(editor)
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
