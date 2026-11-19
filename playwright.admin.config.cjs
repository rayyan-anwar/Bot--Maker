const { defineConfig } = require('@playwright/test');

const port = 4174;
const baseURL = 'http://127.0.0.1:' + port;
const adminEmail = 'owner@admin-e2e.example.test';
const adminPassword = 'botforge-admin-browser-e2e-password';

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  reporter: 'list',
  timeout: 30000,
  expect: { timeout: 10000 },
  use: { baseURL, browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/fixtures/seed-admin.cjs && node server/index.js',
    url: baseURL + '/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      JWT_SECRET: 'botforge-admin-browser-e2e-secret-value-32chars',
      BOTFORGE_ADMIN_EMAIL: adminEmail,
      BOTFORGE_ADMIN_PASSWORD: adminPassword,
      BOTFORGE_DATA_FILE: '/tmp/botforge-admin-browser-e2e.json',
      BOTFORGE_CHAT_RATE_LIMIT: '100'
    }
  }
});
