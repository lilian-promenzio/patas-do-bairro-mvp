'use strict';

const { db } = require('../data/store');
const checklistService = require('./checklistService');
const estoqueService = require('./estoqueService');

function obterResumo() {
  const manha = checklistService.progressoDoTurno('manha');
  const tarde = checklistService.progressoDoTurno('tarde');

  return {
    institucional: { ...db.indicadoresInstitucionais },
    medicacoes: {
      manha,
      tarde,
      totalDia: manha.total + tarde.total,
      aplicadasDia: manha.aplicados + tarde.aplicados,
    },
    estoque: {
      totalItens: db.estoque.length,
      ...estoqueService.resumoAlertas(),
    },
    ultimosRegistros: db.auditoria.slice(-5).reverse(),
  };
}

module.exports = { obterResumo };
