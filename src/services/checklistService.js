'use strict';

const { db } = require('../data/store');
const AppError = require('../utils/AppError');
const { horaLocal, dataLocal } = require('../utils/tempo');

const TURNOS = {
  manha: 'Manhã',
  tarde: 'Tarde',
};

const MIN_JUSTIFICATIVA = 10;

function validarTurno(turno) {
  if (!Object.hasOwn(TURNOS, turno)) {
    throw new AppError(400, 'Turno inválido. Escolha "Manhã" ou "Tarde".', 'TURNO_INVALIDO');
  }
}

function limparAplicacao(item) {
  item.status = 'PENDENTE';
  item.aplicadoPor = null;
  item.horario = null;
  item.aplicadoEm = null;
}

/**
 * Rodada 2 — o checklist vale para um dia operacional.
 * Na primeira consulta de um novo dia (fuso do abrigo), todas as
 * medicações voltam para PENDENTE e o reinício fica registrado na auditoria.
 */
function garantirDiaAtual(agora = new Date()) {
  const hoje = dataLocal(agora);
  if (db.checklistData === hoje) return;

  if (db.checklistData !== null) {
    for (const item of db.checklist) {
      limparAplicacao(item);
      item.correcoes = [];
    }
    db.auditoria.push({
      tipo: 'SISTEMA',
      referencia: 'checklist',
      descricao: `Checklist reiniciado para o dia ${hoje.split('-').reverse().join('/')}`,
      usuarioId: null,
      usuario: 'Sistema',
      horario: horaLocal(agora),
      em: agora.toISOString(),
    });
  }
  db.checklistData = hoje;
}

function apresentarItem(item) {
  const ultima = item.correcoes.at(-1);
  return {
    ...item,
    registro:
      item.status === 'APLICADO' ? `Aplicado às ${item.horario} por ${item.aplicadoPor}` : null,
    ultimaCorrecao:
      ultima && item.status === 'PENDENTE'
        ? `Registro anterior (${ultima.registroAnterior}) corrigido por ${ultima.por} às ${ultima.horario}: ${ultima.justificativa}`
        : null,
  };
}

function progressoDoTurno(turno) {
  const itens = db.checklist.filter((i) => i.turno === turno);
  return {
    total: itens.length,
    aplicados: itens.filter((i) => i.status === 'APLICADO').length,
  };
}

function listar(turno, agora = new Date()) {
  validarTurno(turno);
  garantirDiaAtual(agora);
  const itens = db.checklist.filter((i) => i.turno === turno).map(apresentarItem);
  return {
    turno,
    turnoRotulo: TURNOS[turno],
    data: db.checklistData,
    ...progressoDoTurno(turno),
    itens,
  };
}

function buscar(id) {
  const item = db.checklist.find((i) => i.id === id);
  if (!item) {
    throw new AppError(404, 'Medicação não encontrada. Atualize a lista e tente novamente.', 'NAO_ENCONTRADO');
  }
  return item;
}

/**
 * Registra a aplicação de uma medicação de forma auditável.
 * Impede dose duplicada no mesmo turno (HTTP 409).
 */
function confirmar(id, usuario, agora = new Date()) {
  garantirDiaAtual(agora);
  const item = buscar(id);
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

/**
 * Rodada 2 — a coordenação pode desfazer um registro feito por engano,
 * com justificativa obrigatória. O registro original fica preservado
 * no histórico de correções e na auditoria (nada é apagado).
 */
function corrigir(id, usuario, justificativa, agora = new Date()) {
  if (usuario.perfil !== 'coordenacao') {
    throw new AppError(403, 'Apenas a coordenação pode corrigir registros de aplicação.', 'SEM_PERMISSAO');
  }
  garantirDiaAtual(agora);
  const item = buscar(id);
  if (item.status !== 'APLICADO') {
    throw new AppError(409, 'Esta medicação ainda não foi aplicada; não há registro para corrigir.', 'SEM_REGISTRO');
  }
  const texto = typeof justificativa === 'string' ? justificativa.trim() : '';
  if (texto.length < MIN_JUSTIFICATIVA) {
    throw new AppError(
      400,
      `Descreva o motivo da correção (mínimo de ${MIN_JUSTIFICATIVA} caracteres).`,
      'JUSTIFICATIVA_OBRIGATORIA'
    );
  }

  const correcao = {
    registroAnterior: `${item.horario} por ${item.aplicadoPor}`,
    aplicadoEmAnterior: item.aplicadoEm,
    justificativa: texto.slice(0, 280),
    porId: usuario.id,
    por: usuario.nomeCurto,
    horario: horaLocal(agora),
    em: agora.toISOString(),
  };
  item.correcoes.push(correcao);
  limparAplicacao(item);

  db.auditoria.push({
    tipo: 'CORRECAO',
    referencia: item.id,
    descricao: `Correção: ${item.medicamento} — ${item.animal} (${item.baia}) voltou para pendente. Motivo: ${correcao.justificativa}`,
    usuarioId: usuario.id,
    usuario: usuario.nomeCurto,
    horario: correcao.horario,
    em: correcao.em,
  });

  return {
    item: apresentarItem(item),
    progresso: progressoDoTurno(item.turno),
    mensagem: `Registro corrigido. ${item.animal} voltou para PENDENTE.`,
  };
}

module.exports = { listar, confirmar, corrigir, progressoDoTurno, garantirDiaAtual, TURNOS };
