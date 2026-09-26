import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 无 root 容器里，Chromium 的系统依赖库被解压到 ~/pw-sysroot 供运行时加载；
// 正常 CI/本机有系统库时该目录不存在，配置不受影响。
const localLibDirs = [
  join(homedir(), 'pw-sysroot', 'usr', 'lib', 'aarch64-linux-gnu'),
  join(homedir(), 'pw-sysroot', 'lib', 'aarch64-linux-gnu'),
].filter((p) => existsSync(p));
if (localLibDirs.length > 0) {
  process.env.LD_LIBRARY_PATH = [...localLibDirs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4174',
    launchOptions: {
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-device-for-media-stream',
        ...(localLibDirs.length > 0 ? ['--no-sandbox'] : []), // 仅无 root 的本地库场景需要
      ],
    },
  },
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run preview -- --port 4174',
          port: 4174,
          reuseExistingServer: false,
          timeout: 30_000,
        },
      }),
  reporter: [['list']],
});
