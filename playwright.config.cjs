const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  reporter: 'list',
  timeout: 15000,
  use: {
    browserName: 'chromium',
    headless: true,
    reducedMotion: 'reduce'
  }
});
