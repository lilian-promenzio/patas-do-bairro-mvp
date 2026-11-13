'use strict';

const { Router } = require('express');
const resumoService = require('../services/resumoService');
const { exigirAutenticacao } = require('../middleware/autenticacao');

const router = Router();
router.use(exigirAutenticacao);

router.get('/', (_req, res) => {
  res.json(resumoService.obterResumo());
});

module.exports = router;
