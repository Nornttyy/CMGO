// 入口：导入三个测试文件（导入时它们就会运行），最后打印结果。
// 用 esbuild 打包时，把 'vitest' 别名指向 ./vitest-shim.ts。
import '../tests/vec3.test';
import '../tests/movement.test';
import '../tests/aabb.test';
import { report } from './vitest-shim';

report();
