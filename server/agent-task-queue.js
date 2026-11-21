'use strict';

const MAX_QUEUE_SIZE = 1000;
const DEFAULT_LEASE_MS = 30_000;
const MAX_ATTEMPTS = 3;
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function safeNow(value) {
  const time = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(time)) throw new TypeError('A valid timestamp is required.');
  return time;
}

class AgentTaskQueue {
  constructor({ maxSize = MAX_QUEUE_SIZE, leaseMs = DEFAULT_LEASE_MS, maxAttempts = MAX_ATTEMPTS } = {}) {
    if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > MAX_QUEUE_SIZE) throw new RangeError('maxSize must be between 1 and 1000.');
    if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 15 * 60_000) throw new RangeError('leaseMs must be between 1000 and 900000.');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new RangeError('maxAttempts must be between 1 and 10.');
    this.maxSize = maxSize;
    this.leaseMs = leaseMs;
    this.maxAttempts = maxAttempts;
    this.tasks = new Map();
    this.idempotency = new Map();
  }

  enqueue({ id, ownerId, kind, payload, idempotencyKey }, now = Date.now()) {
    const timestamp = safeNow(now);
    if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new TypeError('Task id is required and must be bounded.');
    if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.length > 128) throw new TypeError('ownerId is required and must be bounded.');
    if (typeof kind !== 'string' || !kind.trim() || kind.length > 80) throw new TypeError('Task kind is required and must be bounded.');
    if (payload === undefined) throw new TypeError('Task payload is required.');
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 160)) throw new TypeTypeError('idempotencyKey must be a non-empty string up to 160 characters.');
    const serialized = JSON.stringify(payload);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 32 * 1024) throw new RangeError('Task payload must be JSON serializable and at most 32 KB.');
    if (this.tasks.has(id)) throw new Error('Task id already exists.');
    const idem = idempotencyKey ? ownerId + ':' + idempotencyKey : null;
    if (idem && this.idempotency.has(idem)) return this.snapshot(this.tasks.get(this.idempotency.get(idem)));
    if ([...this.tasks.values()].filter(task => !TERMINAL.has(task.status)).length >= this.maxSize) throw new Error('Task queue capacity reached.');
    const task = { id, ownerId, kind, payload: JSON.parse(serialized), status: 'queued', attempt: 0, maxAttempts: this.maxAttempts, createdAt: timestamp, updatedAt: timestamp, availableAt: timestamp, leaseOwner: null, leaseExpiresAt: null, lastError: null, idempotencyKey: idem };
    this.tasks.set(id, task);
    if (idem) this.idempotency.set(idem, id);
    return this.snapshot(task);
  }

  claim(workerId, now = Date.now()) {
    const timestamp = safeNow(now);
    if (typeof workerId !== 'string' || !workerId.trim() || workerId.length > 128) throw new TypeTypeError('workerId is required and must be bounded.');
    const task = [...this.tasks.values()].filter(item => item.status === 'queued' && item.availableAt <= timestamp).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))[0];
    if (!task) return null;
    task.status = 'running'; task.attempt += 1; task.leaseOwner = workerId; task.leaseExpiresAt = timestamp + this.leaseMs; task.updatedAt = timestamp;
    return this.snapshot(task);
  }

  heartbeat(taskId, workerId, now = Date.now()) {
    const timestamp = safeNow(now), task = this.tasks.get(taskId);
    if (!task || task.status !== 'running' || task.leaseOwner !== workerId || task.leaseExpiresAt <= timestamp) return null;
    task.leaseExpiresAt = timestamp + this.leaseMs; task.updatedAt = timestamp;
    return this.snapshot(task);
  }

  complete(taskId, workerId, result, now = Date.now()) {
    const timestamp = safeNow(now), task = this.tasks.get(taskId);
    if (!this.ownsLiveLease(task, workerId, timestamp)) return null;
    const serialized = JSON.stringify(result);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 32 * 1024) throw new RangeError('Task result must be JSON serializable and at most 32 KB.');
    task.status = 'completed'; task.result = JSON.parse(serialized); task.updatedAt = timestamp; task.leaseOwner = null; task.leaseExpiresAt = null;
    return this.snapshot(task);
  }

  fail(taskId, workerId, error, now = Date.now(), retryDelayMs = 1000) {
    const timestamp = safeNow(now), task = this.tasks.get(taskId);
    if (!this.ownsLiveLease(task, workerId, timestamp)) return null;
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 60 * 60_000) throw new RangeError('retryDelayMs must be between 0 and 3600000.');
    task.lastError = String(error || 'Task failed').slice(0, 500);
    task.leaseOwner = null; task.leaseExpiresAt = null; task.updatedAt = timestamp;
    if (task.attempt < task.maxAttempts) { task.status = 'queued'; task.availableAt = timestamp + retryDelayMs; }
    else { task.status = 'failed'; }
    return this.snapshot(task);
  }

  cancel(taskId, ownerId, now = Date.now()) {
    const timestamp = safeNow(now), task = this.tasks.get(taskId);
    if (!task || task.ownerId !== ownerId || TERMINAL.has(task.status)) return null;
    task.status = 'cancelled'; task.updatedAt = timestamp; task.leaseOwner = null; task.leaseExpiresAt = null;
    return this.snapshot(task);
  }

  recoverExpired(now = Date.now()) {
    const timestamp = safeNow(now), recovered = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'running' || task.leaseExpiresAt > timestamp) continue;
      task.leaseOwner = null; task.leaseExpiresAt = null; task.updatedAt = timestamp;
      task.lastError = 'Worker lease expired.';
      if (task.attempt < task.maxAttempts) { task.status = 'queued'; task.availableAt = timestamp; recovered.push({ id: task.id, status: 'queued' }); }
      else { task.status = 'failed'; recovered.push({ id: task.id, status: 'failed' }); }
    }
    return recovered;
  }

  get(taskId, ownerId) {
    const task = this.tasks.get(taskId);
    return task && task.ownerId === ownerId ? this.snapshot(task) : null;
  }

  ownsLiveLease(task, workerId, timestamp) {
    return !!task && task.status === 'running' && task.leaseOwner === workerId && task.leaseExpiresAt > timestamp;
  }

  snapshot(task) {
    if (!task) return null;
    const copy = { ...task, payload: JSON.parse(JSON.stringify(task.payload)) };
    if (task.result !== undefined) copy.result = JSON.parse(JSON.stringify(task.result));
    return copy;
  }
}

module.exports = { AgentTaskQueue, MAX_QUEUE_SIZE, DEFAULT_LEASE_MS, MAX_ATTEMPTS };
