'use strict';

const { Router } = require('express');
const AppError = require('../utils/AppError');
const authService = require('../services/authService');
const { exigirAutenticacao } = require('../middleware/autenticacao');

const router = Router();

// RF01 — Autenticação e perfis
router.post('/login', (req, res) => {
  const { email, senha } = req.body || {};

  if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
    throw new AppError(400, 'Informe seu e-mail e sua senha para entrar.', 'CAMPOS_OBRIGATORIOS');
  }

  const sessao = authService.autenticar(email, senha);
  if (!sessao) {
    // Mensagem genérica: não revela se o e-mail existe ou se a senha está errada.
    throw new AppError(401, 'E-mail ou senha incorretos. Verifique os dados e tente novamente.', 'CREDENCIAIS_INVALIDAS');
  }

  res.status(200).json(sessao);
});

router.get('/me', exigirAutenticacao, (req, res) => {
  res.json({ usuario: req.usuario });
});

router.post('/logout', exigirAutenticacao, (req, res) => {
  authService.encerrarSessao(req.token);
  res.status(204).end();
});

module.exports = router;
