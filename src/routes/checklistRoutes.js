'use strict';

const { Router } = require('express');
const checklistService = require('../services/checklistService');
const { exigirAutenticacao } = require('../middleware/autenticacao');

const router = Router();
router.use(exigirAutenticacao);

// RF02 — Checklist diário por turno
router.get('/', (req, res) => {
  const turno = req.query.turno ?? 'manha';
  res.json(checklistService.listar(String(turno)));
});

// RF03 — Registro auditável de aplicação
router.post('/:id/confirmar', (req, res) => {
  res.json(checklistService.confirmar(req.params.id, req.usuario));
});

module.exports = router;
