const { defineConfig } = require('@playwright/test');

const port = 4173;
const baseURL = 'http://127.0.0.1:' + port;

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  reporter: 'list',
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server/index.js',
    url: baseURL + '/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      JWT_SECRET: 'botforge-browser-e2e-only-secret-value-32chars-minimum',
      BOTFORGE_ADMIN_EMAIL: 'owner@browser-e2e.example.test',
      BOTFORGE_DATA_FILE: '/tmp/botforge-browser-e2e-' + process.pid + '.json',
      BOTFORGE_ENABLE_MOCK_PROVIDER: 'true',
      BOTFORGE_CHAT_RATE_LIMIT: '100'
    }
  }
});
