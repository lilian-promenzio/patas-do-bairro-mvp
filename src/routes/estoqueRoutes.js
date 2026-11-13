'use strict';

const { Router } = require('express');
const estoqueService = require('../services/estoqueService');
const { exigirAutenticacao } = require('../middleware/autenticacao');

const router = Router();
router.use(exigirAutenticacao);

// RF04 — Controle de estoque e alertas críticos
router.get('/', (req, res) => {
  const categoria = req.query.categoria ?? 'todos';
  res.json(estoqueService.listar(String(categoria)));
});

router.post('/:id/movimentar', (req, res) => {
  res.json(estoqueService.movimentar(req.params.id, req.body || {}, req.usuario));
});

module.exports = router;
