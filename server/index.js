require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

if (!process.env.JWT_SECRET) {
  console.error('\nMissing JWT_SECRET in your .env file. Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

const { router: authRouter } = require('./auth');
const { router: botsRouter } = require('./bots');
const { router: documentsRouter } = require('./documents');
const { router: chatRouter } = require('./chat');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/bots', botsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/chat', chatRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Any unknown non-API route falls back to the single-page app shell.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI bot platform running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Warning: ANTHROPIC_API_KEY is not set — chatting with bots will fail until you add one to .env');
  }
});
