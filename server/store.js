// Simple JSON-file-based data store.
//
// This is intentionally not a "real" database — no native modules to
// compile, nothing extra to install, works the same on your laptop and
// on a hosting service. It's fine for an MVP with light traffic. If this
// grows, swap this file for a Postgres-backed version later; every other
// file in the app only talks to the functions exported here, so that
// swap wouldn't touch the rest of the code.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function emptyDB() {
  return {
    users: [],       // { id, email, passwordHash, name, createdAt }
    bots: [],         // { id, ownerId, name, instructions, isPublic, createdAt }
    documents: [],     // { id, botId, filename, chunks: [{id, text}], createdAt }
    messages: []        // { id, botId, userId, role, content, createdAt }
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    cache = emptyDB();
    persist();
    return cache;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    cache = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read database file, starting fresh:', err.message);
    cache = emptyDB();
  }
  return cache;
}

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
}

// ---- Generic helpers -------------------------------------------------

function all(collection) {
  return load()[collection];
}

function insert(collection, record) {
  const db = load();
  db[collection].push(record);
  persist();
  return record;
}

function findById(collection, id) {
  return load()[collection].find((r) => r.id === id);
}

function updateById(collection, id, patch) {
  const db = load();
  const idx = db[collection].findIndex((r) => r.id === id);
  if (idx === -1) return null;
  db[collection][idx] = { ...db[collection][idx], ...patch };
  persist();
  return db[collection][idx];
}

function deleteById(collection, id) {
  const db = load();
  const before = db[collection].length;
  db[collection] = db[collection].filter((r) => r.id !== id);
  persist();
  return db[collection].length < before;
}

module.exports = { load, persist, all, insert, findById, updateById, deleteById };
