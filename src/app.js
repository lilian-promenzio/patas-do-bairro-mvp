'use strict';

const path = require('node:path');
const express = require('express');

const authRoutes = require('./routes/authRoutes');
const checklistRoutes = require('./routes/checklistRoutes');
const estoqueRoutes = require('./routes/estoqueRoutes');
const resumoRoutes = require('./routes/resumoRoutes');
const { rotaApiNaoEncontrada, tratarErros } = require('./middleware/erros');

const app = express();
const PASTA_PUBLICA = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');

// Cabeçalhos básicos de segurança (sem dependências extras).
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'self'; " +
      "form-action 'self'; frame-ancestors 'none'",
  });
  next();
});

app.use(express.json({ limit: '10kb' }));

// API REST (respostas nunca ficam em cache)
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// Verificação de saúde usada pela plataforma de deploy (sem autenticação, sem dados)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api', authRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/resumo', resumoRoutes);
app.use('/api', rotaApiNaoEncontrada);

// Front-end PWA
app.use(
  express.static(PASTA_PUBLICA, {
    setHeaders(res, arquivo) {
      // O Service Worker precisa ser sempre revalidado para receber atualizações.
      if (arquivo.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
      if (arquivo.endsWith('manifest.json')) res.type('application/manifest+json');
    },
  })
);

app.use(tratarErros);

module.exports = app;
