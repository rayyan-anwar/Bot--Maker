'use strict';

const { v4: uuidv4 } = require('uuid');
const store = require('./store');

const TASK_KIND = 'agent-task';
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const MAX_TASKS_PER_USER = 100;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_RESULT_BYTES = 32 * 1024;
const DEFAULT_LEASE_MS = 30_000;
const MAX_ATTEMPTS = 3;

function boundedJson(value, maxBytes, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object.');
  let serialized;
  try { serialized = JSON.stringify(value); } catch (_) { throw new TypeError(label + ' must be JSON serializable.'); }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new RangeError(label + ' exceeds the size limit.');
  return JSON.parse(serialized);
}
function taskRecord(row) { return row && row.kind === TASK_KIND ? row : null; }
function publicTask(task) {
  if (!task) return null;
  const { workerToken, ...safe } = task;
  return safe;
}
async function listUserTasks(userId, limit = 50) {
  const rows = await store.findManyAsync('aiEngineerRuns', { userId });
  return rows.filter(row => row.kind === TASK_KIND).sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, Math.max(1, Math.min(100, limit))).map(publicTask);
}
async function enqueueTask({ userId, taskType, payload, idempotencyKey }) {
  if (!store.isPostgres()) return serializeJsonClaim(() => enqueueTaskInternal({ userId, taskType, payload, idempotencyKey }));
  return enqueueTaskInternal({ userId, taskType, payload, idempotencyKey });
}
async function enqueueTaskInternal({ userId, taskType, payload, idempotencyKey }) {
  if (typeof userId !== 'string' || !userId) throw new TypeError('userId required');
  if (typeof taskType !== 'string' || !/^[a-z][a-z0-9.-]{1,79}$/.test(taskType)) throw new TypeError('Invalid task type.');
  const safePayload = boundedJson(payload, MAX_PAYLOAD_BYTES, 'Task payload');
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 160)) throw new TypeError('Invalid idempotency key.');
  const now = new Date().toISOString();
  const task = {
    id: uuidv4(), userId, kind: TASK_KIND, taskType, payload: safePayload, status: 'queued',
    attempt: 0, maxAttempts: MAX_ATTEMPTS, createdAt: now, updatedAt: now, availableAt: now,
    leaseOwner: null, leaseExpiresAt: null, lastError: null, idempotencyKey: idempotencyKey || null,
  };
  const inserted=await store.insertAgentTaskWithinCapacity(task,MAX_TASKS_PER_USER);
  if(inserted.reason==='capacity')throw new Error('Your active task limit has been reached.');
  return {created:inserted.created,task:publicTask(inserted.record)};
}
async function getTaskForUser(taskId, userId) {
  const task = taskRecord(await store.findByIdAsync('aiEngineerRuns', taskId));
  return task && task.userId === userId ? publicTask(task) : null;
}
let jsonClaimLock = Promise.resolve();
function serializeJsonClaim(fn) {
  const run = jsonClaimLock.then(fn, fn);
  jsonClaimLock = run.then(() => undefined, () => undefined);
  return run;
}
async function claimTask(workerId, now = new Date(), leaseMs = DEFAULT_LEASE_MS) {
  if (typeof workerId !== 'string' || !workerId.trim() || workerId.length > 128) throw new TypeError('Invalid worker ID.');
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime()) || !Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 900000) throw new TypeError('Invalid claim parameters.');
  const timestamp = current.toISOString(), expires = new Date(current.getTime() + leaseMs).toISOString();
  if (store.isPostgres()) {
    const result = await store.query(`UPDATE botforge_records SET data=data || jsonb_build_object('status','running','attempt',COALESCE((data->>'attempt')::int,0)+1,'leaseOwner',$1,'leaseExpiresAt',$2,'updatedAt',$3),updated_at=now() WHERE collection='aiEngineerRuns' AND id=(SELECT id FROM botforge_records WHERE collection='aiEngineerRuns' AND data->>'kind'='agent-task' AND data->>'status'='queued' AND COALESCE(data->>'availableAt',$4)<=$4 ORDER BY data->>'availableAt',created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) AND data->>'status'='queued' RETURNING data`, [workerId, expires, timestamp, timestamp]);
    return result.rowCount ? publicTask(result.rows[0].data) : null;
  }
  // Serialize the JSON adapter's read/claim/update section for in-process workers.
  return serializeJsonClaim(async () => {
    const rows = (await store.allAsync('aiEngineerRuns')).filter(row => row.kind === TASK_KIND && row.status === 'queued' && Date.parse(row.availableAt || row.createdAt) <= current.getTime()).sort((a,b) => Date.parse(a.availableAt || a.createdAt) - Date.parse(b.availableAt || b.createdAt) || a.createdAt.localeCompare(b.createdAt));
    if (!rows.length) return null;
    const selected = rows[0];
    const fresh=await store.findByIdAsync('aiEngineerRuns',selected.id);
    if(!fresh||fresh.kind!==TASK_KIND||fresh.status!=='queued'||Date.parse(fresh.availableAt||fresh.createdAt)>current.getTime())return null;
    return publicTask(await store.updateByIdAsync('aiEngineerRuns', selected.id, { status: 'running', attempt: (fresh.attempt || 0) + 1, leaseOwner: workerId, leaseExpiresAt: expires, updatedAt: timestamp }));
  });
}
async function workerOwnedTask(taskId, workerId, now = new Date()) {
  const task = taskRecord(await store.findByIdAsync('aiEngineerRuns', taskId));
  return task && task.status === 'running' && task.leaseOwner === workerId && Date.parse(task.leaseExpiresAt) > now.getTime() ? task : null;
}
async function conditionalWorkerUpdate(taskId, workerId, current, patch) {
  const timestamp = current.toISOString();
  if (store.isPostgres()) {
    const result = await store.query(`UPDATE botforge_records SET data=data || $4::jsonb,updated_at=now() WHERE collection='aiEngineerRuns' AND id=$1 AND data->>'kind'='agent-task' AND data->>'status'='running' AND data->>'leaseOwner'=$2 AND (data->>'leaseExpiresAt')::timestamptz>$3 RETURNING data`, [taskId, workerId, timestamp, JSON.stringify(patch)]);
    return result.rowCount ? publicTask(result.rows[0].data) : null;
  }
  return serializeJsonClaim(async () => {
    const task = await workerOwnedTask(taskId, workerId, current);
    if (!task) return null;
    return publicTask(await store.updateByIdAsync('aiEngineerRuns', taskId, patch));
  });
}
async function heartbeatTask(taskId, workerId, now = new Date(), leaseMs = DEFAULT_LEASE_MS) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime()) || !Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 900000) return null;
  const expires = new Date(current.getTime() + leaseMs).toISOString();
  return conditionalWorkerUpdate(taskId, workerId, current, { leaseExpiresAt: expires, updatedAt: current.toISOString() });
}
async function completeTask(taskId, workerId, result, now = new Date()) {
  const safeResult = boundedJson(result, MAX_RESULT_BYTES, 'Task result');
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('Invalid completion time.');
  return conditionalWorkerUpdate(taskId, workerId, current, { status: 'completed', result: safeResult, completedAt: current.toISOString(), updatedAt: current.toISOString(), leaseOwner: null, leaseExpiresAt: null });
}
async function failTask(taskId, workerId, error, now = new Date(), retryDelayMs = 1000) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('Invalid failure time.');
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 3600000) throw new RangeError('Invalid retry delay.');
  const task = await workerOwnedTask(taskId, workerId, current);
  if (!task) return null;
  const retry = task.attempt < task.maxAttempts, next = retry ? 'queued' : 'failed';
  const patch = { status: next, lastError: String(error || 'Task failed').slice(0, 500), updatedAt: current.toISOString(), leaseOwner: null, leaseExpiresAt: null, availableAt: retry ? new Date(current.getTime() + retryDelayMs).toISOString() : task.availableAt };
  if (!retry) patch.completedAt = current.toISOString();
  return conditionalWorkerUpdate(taskId, workerId, current, patch);
}
async function cancelTask(taskId, userId, now = new Date()) {
  const task = taskRecord(await store.findByIdAsync('aiEngineerRuns', taskId));
  if (!task || task.userId !== userId || TERMINAL.has(task.status)) return null;
  const current = now instanceof Date ? now : new Date(now), timestamp = current.toISOString();
  if (store.isPostgres()) {
    const result = await store.query("UPDATE botforge_records SET data=data || jsonb_build_object('status','cancelled','cancelledAt',$3,'updatedAt',$3,'leaseOwner',NULL,'leaseExpiresAt',NULL),updated_at=now() WHERE collection='aiEngineerRuns' AND id=$1 AND data->>'userId'=$2 AND data->>'kind'='agent-task' AND data->>'status' NOT IN ('completed','failed','cancelled') RETURNING data", [taskId,userId,timestamp]);
    return result.rowCount ? publicTask(result.rows[0].data) : null;
  }
  return serializeJsonClaim(async () => {
    const fresh = taskRecord(await store.findByIdAsync('aiEngineerRuns', taskId));
    if (!fresh || fresh.userId !== userId || TERMINAL.has(fresh.status)) return null;
    return publicTask(await store.updateByIdAsync('aiEngineerRuns', taskId, { status: 'cancelled', cancelledAt: timestamp, updatedAt: timestamp, leaseOwner: null, leaseExpiresAt: null }));
  });
}
async function recoverExpiredTasks(now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('Invalid recovery time.');
  if (store.isPostgres()) {
    const result = await store.query(`UPDATE botforge_records SET data=data || jsonb_build_object('status',CASE WHEN COALESCE((data->>'attempt')::int,0)<COALESCE((data->>'maxAttempts')::int,$1) THEN 'queued' ELSE 'failed' END,'availableAt',$2,'lastError','Worker lease expired.','leaseOwner',NULL,'leaseExpiresAt',NULL,'updatedAt',$2,'completedAt',CASE WHEN COALESCE((data->>'attempt')::int,0)>=COALESCE((data->>'maxAttempts')::int,$1) THEN $2 ELSE NULL END),updated_at=now() WHERE collection='aiEngineerRuns' AND data->>'kind'='agent-task' AND data->>'status'='running' AND (data->>'leaseExpiresAt')::timestamptz<=$2 RETURNING data`, [MAX_ATTEMPTS,current.toISOString()]);
    return result.rows.map(publicTask);
  }
  return serializeJsonClaim(async () => {
    const rows=(await store.allAsync('aiEngineerRuns')).filter(row=>row.kind===TASK_KIND&&row.status==='running'&&Date.parse(row.leaseExpiresAt)<=current.getTime());
    const recovered=[];
    for(const row of rows){
      const fresh=taskRecord(await store.findByIdAsync('aiEngineerRuns',row.id));
      if(!fresh||fresh.status!=='running'||Date.parse(fresh.leaseExpiresAt)>current.getTime())continue;
      const terminal=fresh.attempt>=fresh.maxAttempts;
      const patch={status:terminal?'failed':'queued',availableAt:current.toISOString(),lastError:'Worker lease expired.',leaseOwner:null,leaseExpiresAt:null,updatedAt:current.toISOString()};
      if(terminal)patch.completedAt=current.toISOString();
      const updated=await store.updateByIdAsync('aiEngineerRuns',fresh.id,patch);
      if(updated)recovered.push(publicTask(updated));
    }
    return recovered;
  });
}
module.exports = { TASK_KIND, MAX_TASKS_PER_USER, MAX_PAYLOAD_BYTES, MAX_RESULT_BYTES, DEFAULT_LEASE_MS, MAX_ATTEMPTS, enqueueTask, listUserTasks, getTaskForUser, claimTask, heartbeatTask, completeTask, failTask, cancelTask, recoverExpiredTasks };
