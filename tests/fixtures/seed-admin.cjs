const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

(async () => {
  const dataFile = process.env.BOTFORGE_DATA_FILE;
  const email = String(process.env.BOTFORGE_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.BOTFORGE_ADMIN_PASSWORD || '');
  if (!dataFile || !email || password.length < 16) throw new Error('Admin E2E seed configuration is incomplete.');
  fs.rmSync(dataFile, { force: true });
  const store = require('../../server/store');
  await store.initialize();
  try {
    await store.insertAsync('users', {
      id: uuidv4(),
      email,
      name: 'Browser E2E Administrator',
      passwordHash: await bcrypt.hash(password, 4),
      sessionVersion: 0,
      failedLoginAttempts: 0,
      lockedAt: null,
      plan: 'pro',
      createdAt: new Date().toISOString()
    });
  } finally {
    await store.close();
  }
})().catch(error => {
  process.stderr.write('Admin E2E seed failed: ' + error.message + '\\n');
  process.exitCode = 1;
});
