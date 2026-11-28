'use strict';

const store = require('./store');
const { dispatchBudgetAlertOutbox } = require('./ai-budget-alert-dispatcher');
const { isBudgetAlertDeliveryConfigured, sendBudgetAlertEmail } = require('./ai-budget-alert-email');

let timer = null;
let active = null;

async function dispatchOnce() {
  if (active) return active;
  active = dispatchBudgetAlertOutbox(store.query, sendBudgetAlertEmail, { batchSize: 20, leaseSeconds: 60, retrySeconds: 60, maxAttempts: 5 })
    .then(summary => {
      if (summary.claimed) console.info('BotForge budget alert delivery:', {
        claimed: summary.claimed, delivered: summary.delivered, retried: summary.retried, failed: summary.failed, ignored: summary.ignored,
      });
      return summary;
    })
    .catch(error => {
      console.error('BotForge budget alert delivery failed:', String(error?.message || 'Unknown error').slice(0, 300));
      return null;
    })
    .finally(() => { active = null; });
  return active;
}

function startWorker({ intervalMs = 30000 } = {}) {
  if (process.env.BOTFORGE_BUDGET_ALERT_WORKER !== '1' || !store.isPostgres() || !isBudgetAlertDeliveryConfigured()) return false;
  if (timer) return true;
  void dispatchOnce();
  timer = setInterval(() => { void dispatchOnce(); }, intervalMs);
  timer.unref?.();
  return true;
}

async function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  if (active) await active;
}

module.exports = { startWorker, stopWorker, dispatchOnce };
