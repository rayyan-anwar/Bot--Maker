const { test, expect } = require('@playwright/test');

test('user signs up, opens a bot, chats, sees Fortisni react and reloads saved history', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#signup-name').fill('Browser E2E User');
  await page.locator('#signup-email').fill('browser-e2e-user@example.test');
  await page.locator('#signup-password').fill('browser-e2e-password-123');
  await page.getByRole('button', { name: 'Create free account' }).click();

  await expect(page).toHaveURL(/dashboard\.html/);
  await expect(page.getByRole('heading', { name: 'Your bots' })).toBeVisible();

  const created = await page.evaluate(async () => {
    const response = await fetch('/api/bots', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Browser Flow Bot',
        description: 'Temporary end-to-end test bot',
        instructions: 'Answer clearly and briefly.',
        provider: 'mock',
        isPublic: false,
        welcomeMessage: 'Welcome to the browser test.'
      })
    });
    return { status: response.status, body: await response.json() };
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const botId = created.body.bot.id;
  expect(botId).toBeTruthy();

  await page.goto('/bot.html?id=' + encodeURIComponent(botId));
  await expect(page.locator('#bot-name')).toHaveText('Browser Flow Bot');
  await expect(page.locator('#fortisni-companion [role="status"]')).toHaveText('I’m here whenever you need me.');
  await expect(page.locator('#chat-log .msg.assistant').first()).toHaveText('Welcome to the browser test.');

  const userText = 'I am worried about this test, can you help me?';
  await page.locator('#chat-input').fill(userText);
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.locator('#chat-log .msg.user').last()).toHaveText(userText);
  await expect(page.locator('#fortisni-companion')).toHaveAttribute('data-state', 'concerned');
  await expect(page.locator('#chat-log .msg.assistant').last()).toContainText('[BotForge mock response]');
  await expect(page.locator('#chat-log .msg.assistant').last()).toContainText(userText);
  await expect(page.locator('#fortisni-companion')).toHaveAttribute('data-state', 'concerned');

  await page.reload();
  await expect(page.locator('#bot-name')).toHaveText('Browser Flow Bot');
  await expect(page.locator('#chat-log .msg.user').last()).toHaveText(userText);
  await expect(page.locator('#chat-log .msg.assistant').last()).toContainText('[BotForge mock response]');
});
