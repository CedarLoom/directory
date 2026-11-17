import { defineConfig, devices } from '@playwright/test';

// The engine subset: accessibility, tap targets and field size on phones and the other engines.
const engines = /@engines/;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/static-server.ts', url: 'http://127.0.0.1:4173/', reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'], grepInvert: /@visual/ },
    { name: 'chromium-phone', use: devices['Pixel 7'], grep: engines },
    { name: 'webkit-phone', use: devices['iPhone 15'], grep: engines },
    { name: 'webkit', use: devices['Desktop Safari'], grep: engines },
    { name: 'firefox', use: devices['Desktop Firefox'], grep: engines },
    // Screenshots differ between systems; CI takes them in the pinned Playwright image only.
    { name: 'visual', use: devices['Desktop Chrome'], grep: /@visual/ },
  ],
});
