import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022', // 支持顶层 await（main.ts 进场前等模型加载好）
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
