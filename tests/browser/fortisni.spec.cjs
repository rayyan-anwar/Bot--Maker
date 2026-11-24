const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fixture = pathToFileURL(path.resolve(__dirname, '../fixtures/fortisni-browser.html')).href;

test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
});

test('Fortisni mounts in a real browser with an accessible live status', async ({ page }) => {
  const companion = page.locator('#fortisni-companion');
  await expect(companion).toHaveAttribute('data-state', 'idle');
  await expect(companion.locator('svg')).toHaveAttribute('aria-label', 'Fortisni, BotForge AI companion');
  await expect(companion.locator('[role="status"]')).toHaveText('I’m here whenever you need me.');
});

test('Fortisni reacts to user text and assistant responses in the browser', async ({ page }) => {
  const companion = page.locator('#fortisni-companion');
  await page.evaluate(() => window.setFortisniText('I am worried about this', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'concerned');
  await expect(companion.locator('[role="status"]')).toHaveText('I’ll take this seriously and help you through it.');

  await page.evaluate(() => window.setFortisniText('The answer is ready.', 'assistant'));
  await expect(companion).toHaveAttribute('data-state', 'speaking');
  await expect(companion.locator('[role="status"]')).toHaveText('Here’s what I found.');
});

test('Fortisni handles Hindi text and unknown states without breaking the page', async ({ page }) => {
  const companion = page.locator('#fortisni-companion');
  await page.evaluate(() => window.setFortisniText('मैं बहुत परेशान हूं', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'sad');

  await page.evaluate(() => window.setFortisniState('not-a-real-state'));
  await expect(companion).toHaveAttribute('data-state', 'idle');
});

test('Fortisni displays untrusted text as text, never as executable markup', async ({ page }) => {
  const payload = '<img src=x onerror=window.__fortisniXss=true>';
  await page.evaluate(value => window.setFortisniState('thinking', value), payload);
  await expect(page.locator('#fortisni-companion [role="status"]')).toHaveText(payload);
  await expect(page.locator('#fortisni-companion img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__fortisniXss)).toBeUndefined();
});

test('Fortisni preserves its dedicated warm expression for affectionate Hinglish text', async ({ page }) => {
  const companion = page.locator('#fortisni-companion');
  await page.evaluate(() => window.setFortisniText('Tum mere dost ho', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'warm');
  await expect(companion.locator('[role="status"]')).toHaveText('I’m glad you’re here. What’s on your mind?');
});

test('Fortisni ignores accidental affection substrings in unrelated Roman Hindi words', async ({ page }) => {
  const companion = page.locator('#fortisni-companion');
  await page.evaluate(() => window.setFortisniText('This is a dostana movie', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'idle');
});

test('Fortisni does not confuse negated emotions with positive or negative states', async ({ page }) => {
  const companion = page.locator('#fortisni-companion');
  await page.evaluate(() => window.setFortisniText('I am not sad today', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'idle');
  await page.evaluate(() => window.setFortisniText('मैं दुखी नहीं हूं', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'idle');
  await page.evaluate(() => window.setFortisniText('I am not sad but happy', 'user'));
  await expect(companion).toHaveAttribute('data-state', 'happy');
});
