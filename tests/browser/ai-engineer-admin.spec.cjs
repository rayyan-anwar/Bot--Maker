const { test, expect } = require('@playwright/test');

const adminEmail = 'owner@admin-e2e.example.test';
const adminPassword = 'botforge-admin-browser-e2e-password';

test('administrator can sign in, pause and resume AI Engineer, and verify fail-closed behavior', async ({ page }) => {
  await page.goto('/');
  await page.locator('#login-email').fill(adminEmail);
  await page.locator('#login-password').fill(adminPassword);
  await page.locator('#login-form button[type="submit"]').click();

  await expect(page).toHaveURL(/admin[.]html/);
  await expect(page.getByRole('heading', { name: 'AI Engineer controls' })).toBeVisible();

  const controlStatus = page.locator('#engineer-control-status');
  const toggle = page.locator('#toggle-engineer');

  await expect(controlStatus).toContainText('AI Engineer is paused');
  await expect(toggle).toHaveText('Resume AI Engineer');

  await page.getByRole('button', { name: 'Resume AI Engineer' }).click();
  await expect(controlStatus).toContainText('AI Engineer resumed');
  await expect(toggle).toHaveText('Pause AI Engineer');

  const enabledResponse = await page.evaluate(async () => {
    const response = await fetch('/api/admin/engineer/control');
    return { status: response.status, body: await response.json() };
  });
  expect(enabledResponse.status).toBe(200);
  expect(enabledResponse.body.enabled).toBe(true);

  await page.getByRole('button', { name: 'Pause AI Engineer' }).click();
  await expect(controlStatus).toContainText('AI Engineer paused');
  await expect(toggle).toHaveText('Resume AI Engineer');

  const blocked = await page.evaluate(async () => {
    const response = await fetch('/api/admin/engineer/diagnose-ci', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    return { status: response.status, body: await response.json() };
  });
  expect(blocked.status).toBe(423);
  expect(blocked.body.error).toContain('paused');

  const audit = await page.evaluate(async () => {
    const response = await fetch('/api/admin/engineer/audit');
    return { status: response.status, body: await response.json() };
  });
  expect(audit.status).toBe(200);
  expect(audit.body.redacted).toBe(true);
  expect(audit.body.events.some(event => event.route === '/engineer/control' && event.method === 'PUT')).toBe(true);
  expect(audit.body.events.some(event => event.route === '/engineer/diagnose-ci' && event.statusCode === 423)).toBe(true);
});

test('ordinary signed-in users cannot access the administrator dashboard or API', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#signup-name').fill('Regular Browser User');
  await page.locator('#signup-email').fill('regular-admin-e2e@example.test');
  await page.locator('#signup-password').fill('regular-browser-password-123');
  await page.getByRole('button', { name: 'Create free account' }).click();
  await expect(page).toHaveURL(/dashboard[.]html/);

  await page.goto('/admin.html');
  await expect(page.getByText('Administrator access required.')).toBeVisible();

  const denied = await page.evaluate(async () => {
    const response = await fetch('/api/admin/engineer/control');
    return { status: response.status, body: await response.json() };
  });
  expect(denied.status).toBe(403);
  expect(denied.body.error).toContain('Administrator access');
});
