// Browser scenarios: the built web client, served by `vite preview`. Run with `just e2e` (builds first).
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, SERVER_COMMAND, SERVER_CWD } from './server.ts';

export default defineConfig({
  testDir: '.',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../.e2e-report' }]] : 'list',
  outputDir: '../.e2e-results',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 900, height: 700 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'web', testIgnore: /desktop\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop', testMatch: /desktop\.spec\.ts/ },
  ],
  webServer: {
    command: SERVER_COMMAND,
    cwd: SERVER_CWD,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
