'use strict';

const { db } = require('../data/store');
const AppError = require('../utils/AppError');
const { horaLocal } = require('../utils/tempo');

const TURNOS = {
  manha: 'Manhã',
  tarde: 'Tarde',
};

function validarTurno(turno) {
  if (!Object.hasOwn(TURNOS, turno)) {
    throw new AppError(400, 'Turno inválido. Escolha "Manhã" ou "Tarde".', 'TURNO_INVALIDO');
  }
}

function apresentarItem(item) {
  return {
    ...item,
    registro:
      item.status === 'APLICADO' ? `Aplicado às ${item.horario} por ${item.aplicadoPor}` : null,
  };
}

function progressoDoTurno(turno) {
  const itens = db.checklist.filter((i) => i.turno === turno);
  return {
    total: itens.length,
    aplicados: itens.filter((i) => i.status === 'APLICADO').length,
  };
}

function listar(turno) {
  validarTurno(turno);
  const itens = db.checklist
    .filter((i) => i.turno === turno)
    .map(apresentarItem);
  return {
    turno,
    turnoRotulo: TURNOS[turno],
    ...progressoDoTurno(turno),
    itens,
  };
}

/**
 * Registra a aplicação de uma medicação de forma auditável.
 * Impede dose duplicada no mesmo turno (HTTP 409).
 */
function confirmar(id, usuario, agora = new Date()) {
  const item = db.checklist.find((i) => i.id === id);
  if (!item) {
    throw new AppError(404, 'Medicação não encontrada. Atualize a lista e tente novamente.', 'NAO_ENCONTRADO');
  }
  if (item.status === 'APLICADO') {
    throw new AppError(
      409,
      `Esta medicação já foi aplicada neste turno (às ${item.horario} por ${item.aplicadoPor}). Não aplique novamente.`,
      'DOSE_DUPLICADA'
    );
  }

  item.status = 'APLICADO';
  item.aplicadoPor = usuario.nomeCurto;
  item.horario = horaLocal(agora);
  item.aplicadoEm = agora.toISOString();

  db.auditoria.push({
    tipo: 'MEDICACAO',
    referencia: item.id,
    descricao: `${item.medicamento} ${item.dosagem} — ${item.animal} (${item.baia})`,
    usuarioId: usuario.id,
    usuario: usuario.nomeCurto,
    horario: item.horario,
    em: item.aplicadoEm,
  });

  return {
    item: apresentarItem(item),
    progresso: progressoDoTurno(item.turno),
  };
}

module.exports = { listar, confirmar, progressoDoTurno, TURNOS };
