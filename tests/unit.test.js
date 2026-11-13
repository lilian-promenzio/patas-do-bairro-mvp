'use strict';

/**
 * Testes unitários: regras de negócio testadas diretamente nos serviços,
 * sem HTTP, com datas controladas.
 */

process.env.NODE_ENV = 'test';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { db, resetStore } = require('../src/data/store');
const checklistService = require('../src/services/checklistService');
const estoqueService = require('../src/services/estoqueService');
const { horaLocal, dataLocal } = require('../src/utils/tempo');

const LUCAS = { id: 'u1', nomeCurto: 'Lucas', perfil: 'voluntario' };
const CAMILA = { id: 'u2', nomeCurto: 'Camila', perfil: 'coordenacao' };

// 13/11/2026 08:42 e 14/11/2026 07:00 no horário de Brasília (UTC-3)
const HOJE_0842 = new Date('2026-11-13T11:42:00Z');
const AMANHA_0700 = new Date('2026-11-14T10:00:00Z');

beforeEach(() => resetStore());

describe('utils/tempo', () => {
  it('formata hora e dia no fuso do abrigo', () => {
    assert.equal(horaLocal(HOJE_0842), '08:42');
    assert.equal(dataLocal(HOJE_0842), '2026-11-13');
    // 23:30 em Brasília ainda é o mesmo dia, embora já seja dia seguinte em UTC
    assert.equal(dataLocal(new Date('2026-11-14T02:30:00Z')), '2026-11-13');
  });
});

describe('estoqueService.calcularStatus', () => {
  it('é CRITICO só quando o saldo fica abaixo do mínimo', () => {
    assert.equal(estoqueService.calcularStatus({ saldoAtual: 9.99, estoqueMinimo: 10 }), 'CRITICO');
    assert.equal(estoqueService.calcularStatus({ saldoAtual: 10, estoqueMinimo: 10 }), 'NORMAL');
    assert.equal(estoqueService.calcularStatus({ saldoAtual: 0, estoqueMinimo: 1 }), 'CRITICO');
  });
});

describe('checklistService — registro e reinício diário', () => {
  it('registra o horário exato informado', () => {
    const { item } = checklistService.confirmar('m1', LUCAS, HOJE_0842);
    assert.equal(item.registro, 'Aplicado às 08:42 por Lucas');
  });

  it('no mesmo dia, o checklist mantém os registros', () => {
    checklistService.listar('manha', HOJE_0842);
    checklistService.confirmar('m1', LUCAS, HOJE_0842);
    const lista = checklistService.listar('manha', new Date('2026-11-13T20:00:00Z'));
    assert.equal(lista.aplicados, 2);
  });

  it('em um novo dia, todas as medicações voltam para PENDENTE e o reinício é auditado', () => {
    checklistService.listar('manha', HOJE_0842);
    checklistService.confirmar('m1', LUCAS, HOJE_0842);

    const manha = checklistService.listar('manha', AMANHA_0700);
    assert.equal(manha.data, '2026-11-14');
    assert.equal(manha.aplicados, 0);
    assert.ok(manha.itens.every((i) => i.status === 'PENDENTE' && i.aplicadoPor === null));
    assert.equal(db.auditoria.at(-1).tipo, 'SISTEMA');
  });

  it('a correção preserva o registro anterior no histórico', () => {
    checklistService.confirmar('m1', LUCAS, HOJE_0842);
    const { item } = checklistService.corrigir('m1', CAMILA, 'Dose registrada no animal errado.', HOJE_0842);
    assert.equal(item.status, 'PENDENTE');
    assert.equal(item.correcoes.length, 1);
    assert.equal(item.correcoes[0].registroAnterior, '08:42 por Lucas');
  });
});
