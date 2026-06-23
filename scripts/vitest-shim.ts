// 一个极简的 vitest 替身（垫片），让测试文件不依赖 vitest 也能跑。
// 在这台负载很重的共享机器上，vitest 的多进程经常卡超时，所以用它做"快速逻辑测试"。
// （你自己电脑上正常用 `npm test`（真 vitest）即可。）
let passed = 0;
let failed = 0;
const failures: string[] = [];

export function describe(_name: string, fn: () => void): void {
  fn();
}

export function it(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${name}: ${(e as Error).message}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function expect(actual: unknown) {
  return {
    toBe(expected: unknown): void {
      if (actual !== expected) throw new Error(`期望 ${String(expected)}，实际 ${String(actual)}`);
    },
    toEqual(expected: unknown): void {
      if (!deepEqual(actual, expected)) {
        throw new Error(`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
      }
    },
  };
}

export function report(): void {
  for (const f of failures) console.error('  ✗ ' + f);
  console.log(`\n结果：通过 ${passed} 个，失败 ${failed} 个`);
  if (failed > 0) process.exit(1);
}
