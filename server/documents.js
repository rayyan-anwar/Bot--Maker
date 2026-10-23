const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const { requireAuth } = require('./auth');
const { chunkText } = require('./retrieval');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const ok = ['.txt', '.md', '.pdf'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only .txt, .md, and .pdf files are supported right now.'), ok);
  }
});

function publicDoc(doc) {
  return {
    id: doc.id,
    botId: doc.botId,
    filename: doc.filename,
    chunkCount: doc.chunks.length,
    createdAt: doc.createdAt
  };
}

function requireBotOwner(req, res, next) {
  const bot = store.findById('bots', req.params.botId);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (bot.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can manage this bot\'s documents.' });
  req.bot = bot;
  next();
}

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

router.get('/:botId', requireAuth, requireBotOwner, (req, res) => {
  const docs = store.all('documents').filter((d) => d.botId === req.params.botId);
  res.json({ documents: docs.map(publicDoc) });
});

router.post('/:botId', requireAuth, requireBotOwner, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received.' });

  try {
    const text = await extractText(req.file.path, req.file.originalname);
    const pieces = chunkText(text);

    if (pieces.length === 0) {
      return res.status(400).json({ error: "That file doesn't seem to contain any readable text." });
    }

    const doc = {
      id: uuidv4(),
      botId: req.params.botId,
      filename: req.file.originalname,
      chunks: pieces.map((text) => ({ id: uuidv4(), text })),
      createdAt: new Date().toISOString()
    };
    store.insert('documents', doc);
    res.status(201).json({ document: publicDoc(doc) });
  } catch (err) {
    console.error('Document processing failed:', err);
    res.status(500).json({ error: 'Could not read that file.' });
  } finally {
    // We only keep extracted text, not the original upload.
    fs.unlink(req.file.path, () => {});
  }
});

router.delete('/:botId/:docId', requireAuth, requireBotOwner, (req, res) => {
  const doc = store.findById('documents', req.params.docId);
  if (!doc || doc.botId !== req.params.botId) return res.status(404).json({ error: 'Document not found.' });
  store.deleteById('documents', doc.id);
  res.json({ ok: true });
});

module.exports = { router };
