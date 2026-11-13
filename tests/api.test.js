'use strict';

process.env.NODE_ENV = 'test';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../src/app');
const { resetStore } = require('../src/data/store');

const LUCAS = { email: 'lucas.ferreira@patasdobairro.org.br', senha: 'Patas2026#' };
const CAMILA = { email: 'camila.santos@patasdobairro.org.br', senha: 'Patas2026#' };
const MSG_LOGIN_INVALIDO = 'E-mail ou senha incorretos. Verifique os dados e tente novamente.';

async function entrar(credenciais = LUCAS) {
  const res = await request(app).post('/api/login').send(credenciais).expect(200);
  return res.body.token;
}

function semDetalhesTecnicos(body) {
  const texto = JSON.stringify(body);
  assert.ok(!('stack' in body), 'não deve expor stack');
  assert.doesNotMatch(texto, /at\s+\S+\s+\(|node_modules|\.js:\d+|Error:/);
}

beforeEach(() => resetStore());

describe('RF01 — Autenticação e perfis', () => {
  it('login válido retorna 200, token e dados do voluntário', async () => {
    const res = await request(app).post('/api/login').send(LUCAS).expect(200);
    assert.match(res.body.token, /^[a-f0-9]{64}$/);
    assert.equal(res.body.usuario.nome, 'Lucas Ferreira');
    assert.equal(res.body.usuario.perfil, 'voluntario');
    assert.equal(res.body.usuario.senhaHash, undefined);
    assert.equal(res.body.usuario.salt, undefined);
  });

  it('login da coordenação retorna perfil "coordenacao" (e-mail sem diferenciar maiúsculas)', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ ...CAMILA, email: '  Camila.Santos@PatasDoBairro.org.br ' })
      .expect(200);
    assert.equal(res.body.usuario.perfil, 'coordenacao');
  });

  it('senha incorreta retorna 401 com mensagem genérica e sem stack trace', async () => {
    const res = await request(app).post('/api/login').send({ ...LUCAS, senha: 'errada' }).expect(401);
    assert.equal(res.body.mensagem, MSG_LOGIN_INVALIDO);
    assert.equal(res.body.token, undefined);
    semDetalhesTecnicos(res.body);
  });

  it('e-mail inexistente recebe exatamente a mesma mensagem (não revela contas)', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'ninguem@exemplo.org', senha: 'Patas2026#' })
      .expect(401);
    assert.equal(res.body.mensagem, MSG_LOGIN_INVALIDO);
  });

  it('campos vazios retornam 400 orientando o preenchimento', async () => {
    const res = await request(app).post('/api/login').send({ email: '', senha: '' }).expect(400);
    assert.match(res.body.mensagem, /Informe seu e-mail e sua senha/);
  });

  it('JSON malformado retorna 400 amigável', async () => {
    const res = await request(app)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    semDetalhesTecnicos(res.body);
  });

  it('rotas protegidas exigem token e logout invalida a sessão', async () => {
    await request(app).get('/api/checklist').expect(401);
    const token = await entrar();
    await request(app).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).post('/api/logout').set('Authorization', `Bearer ${token}`).expect(204);
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`).expect(401);
    semDetalhesTecnicos(res.body);
  });
});

describe('RF02 — Checklist diário por turno', () => {
  it('turno da manhã retorna os 3 cartões corretos e progresso 1 de 3', async () => {
    const token = await entrar();
    const res = await request(app)
      .get('/api/checklist?turno=manha')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.equal(res.body.turno, 'manha');
    assert.equal(res.body.total, 3);
    assert.equal(res.body.aplicados, 1);
    assert.deepEqual(
      res.body.itens.map((i) => [i.baia, i.animal, i.especie, i.status]),
      [
        ['Baia 03', 'Ninhada Mel', 'Cão', 'PENDENTE'],
        ['Baia 01', 'Thor', 'Cão', 'APLICADO'],
        ['Baia 05', 'Luna', 'Gato', 'PENDENTE'],
      ]
    );
    const [mel, thor, luna] = res.body.itens;
    assert.equal(mel.medicamento, 'Vermífugo Oral');
    assert.equal(mel.dosagem, '5 ml');
    assert.equal(mel.via, 'Via oral');
    assert.equal(thor.via, 'Misturar na ração');
    assert.equal(thor.registro, 'Aplicado às 08:42 por Lucas');
    assert.equal(luna.via, 'Aplicação tópica');
  });

  it('turno da tarde retorna os 2 cartões pendentes', async () => {
    const token = await entrar();
    const res = await request(app)
      .get('/api/checklist?turno=tarde')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.equal(res.body.total, 2);
    assert.equal(res.body.aplicados, 0);
    assert.deepEqual(
      res.body.itens.map((i) => [i.baia, i.animal, i.medicamento, i.status]),
      [
        ['Baia 01', 'Thor', 'Antibiótico', 'PENDENTE'],
        ['Baia 04', 'Pipoca', 'Anti-inflamatório', 'PENDENTE'],
      ]
    );
  });

  it('turno inválido retorna 400', async () => {
    const token = await entrar();
    const res = await request(app)
      .get('/api/checklist?turno=noite')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    assert.match(res.body.mensagem, /Turno inválido/);
  });
});

describe('RF03 — Registro auditável de aplicação', () => {
  it('confirma aplicação com autor e horário e bloqueia dose duplicada (409)', async () => {
    const token = await entrar();
    const auth = { Authorization: `Bearer ${token}` };

    const res = await request(app).post('/api/checklist/m1/confirmar').set(auth).expect(200);
    assert.equal(res.body.item.status, 'APLICADO');
    assert.equal(res.body.item.aplicadoPor, 'Lucas');
    assert.match(res.body.item.horario, /^\d{2}:\d{2}$/);
    assert.equal(res.body.item.registro, `Aplicado às ${res.body.item.horario} por Lucas`);
    assert.ok(!Number.isNaN(Date.parse(res.body.item.aplicadoEm)));
    assert.deepEqual(res.body.progresso, { total: 3, aplicados: 2 });

    const dup = await request(app).post('/api/checklist/m1/confirmar').set(auth).expect(409);
    assert.match(dup.body.mensagem, /já foi aplicada neste turno/);
    semDetalhesTecnicos(dup.body);

    // Mesmo outra pessoa não consegue duplicar a dose
    const tokenCamila = await entrar(CAMILA);
    await request(app)
      .post('/api/checklist/m1/confirmar')
      .set('Authorization', `Bearer ${tokenCamila}`)
      .expect(409);

    const lista = await request(app).get('/api/checklist?turno=manha').set(auth).expect(200);
    assert.equal(lista.body.aplicados, 2);
    assert.equal(lista.body.itens.find((i) => i.id === 'm1').aplicadoPor, 'Lucas');
  });

  it('item já aplicado nos dados iniciais (Thor, manhã) também retorna 409', async () => {
    const token = await entrar();
    await request(app).post('/api/checklist/m2/confirmar').set('Authorization', `Bearer ${token}`).expect(409);
  });

  it('aplicar no turno da manhã não afeta o mesmo animal no turno da tarde', async () => {
    const token = await entrar();
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app).post('/api/checklist/t1/confirmar').set(auth).expect(200);
    assert.equal(res.body.item.turno, 'tarde');
    assert.deepEqual(res.body.progresso, { total: 2, aplicados: 1 });
  });

  it('medicação inexistente retorna 404', async () => {
    const token = await entrar();
    await request(app).post('/api/checklist/x99/confirmar').set('Authorization', `Bearer ${token}`).expect(404);
  });
});

describe('RF04 — Controle de estoque e alertas críticos', () => {
  async function listar(token, categoria = 'todos') {
    const res = await request(app)
      .get(`/api/estoque?categoria=${categoria}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body;
  }

  function movimentar(token, id, corpo) {
    return request(app).post(`/api/estoque/${id}/movimentar`).set('Authorization', `Bearer ${token}`).send(corpo);
  }

  it('lista insumos com status calculado e alerta de itens críticos', async () => {
    const token = await entrar();
    const body = await listar(token);
    const porNome = Object.fromEntries(body.itens.map((i) => [i.nome, i]));

    assert.equal(body.itens.length, 3);
    assert.equal(porNome['Ração Filhote'].status, 'CRITICO');
    assert.equal(porNome['Ração Adulto'].status, 'NORMAL');
    assert.equal(porNome['Vermífugo Oral'].status, 'CRITICO');
    assert.equal(body.alerta.totalCriticos, 2);
  });

  it('filtra por categoria e rejeita categoria inválida', async () => {
    const token = await entrar();
    assert.deepEqual((await listar(token, 'racao')).itens.map((i) => i.nome), ['Ração Filhote', 'Ração Adulto']);
    assert.deepEqual((await listar(token, 'medicamento')).itens.map((i) => i.nome), ['Vermífugo Oral']);
    // O alerta é sempre global, mesmo com filtro
    assert.equal((await listar(token, 'medicamento')).alerta.totalCriticos, 2);
    await request(app).get('/api/estoque?categoria=brinquedo').set('Authorization', `Bearer ${token}`).expect(400);
  });

  it('entrada soma corretamente e tira o item do estado crítico', async () => {
    const token = await entrar();
    const res = await movimentar(token, 'e1', { tipo: 'entrada', quantidade: 10 }).expect(200);
    assert.equal(res.body.item.saldoAtual, 14);
    assert.equal(res.body.item.status, 'NORMAL');
    assert.equal(res.body.alerta.totalCriticos, 1);
    assert.equal(res.body.movimentacao.usuario, 'Lucas');
  });

  it('entrada com valor decimal (kg) é aceita sem erro de arredondamento', async () => {
    const token = await entrar();
    await movimentar(token, 'e1', { tipo: 'entrada', quantidade: 0.1 }).expect(200);
    const res = await movimentar(token, 'e1', { tipo: 'entrada', quantidade: 0.2 }).expect(200);
    assert.equal(res.body.item.saldoAtual, 4.3);
  });

  it('saída válida subtrai e atualiza o alerta crítico', async () => {
    const token = await entrar();
    const res = await movimentar(token, 'e2', { tipo: 'saida', quantidade: 30 }).expect(200);
    assert.equal(res.body.item.saldoAtual, 15);
    assert.equal(res.body.item.status, 'CRITICO');
    assert.equal(res.body.alerta.totalCriticos, 3);
    assert.match(res.body.mensagem, /abaixo do estoque mínimo/);
  });

  it('saída igual ao saldo zera o estoque', async () => {
    const token = await entrar();
    const res = await movimentar(token, 'e3', { tipo: 'saida', quantidade: 3 }).expect(200);
    assert.equal(res.body.item.saldoAtual, 0);
  });

  it('saída maior que o saldo disponível é bloqueada com 400 e não altera o saldo', async () => {
    const token = await entrar();
    const res = await movimentar(token, 'e3', { tipo: 'saida', quantidade: 5 }).expect(400);
    assert.equal(res.body.codigo, 'SALDO_INSUFICIENTE');
    assert.match(res.body.mensagem, /maior que o saldo disponível \(3 frascos\)/);
    semDetalhesTecnicos(res.body);

    const body = await listar(token, 'medicamento');
    assert.equal(body.itens[0].saldoAtual, 3);
  });

  it('valida quantidade (> 0, numérica, inteira para frascos) e tipo', async () => {
    const token = await entrar();
    for (const quantidade of [0, -2, '5', null, undefined]) {
      const res = await movimentar(token, 'e1', { tipo: 'entrada', quantidade }).expect(400);
      assert.equal(res.body.mensagem, 'Informe uma quantidade maior que zero.');
    }
    await movimentar(token, 'e3', { tipo: 'entrada', quantidade: 1.5 }).expect(400);
    await movimentar(token, 'e1', { tipo: 'doacao', quantidade: 1 }).expect(400);
    await movimentar(token, 'e99', { tipo: 'entrada', quantidade: 1 }).expect(404);
  });
});

describe('Rodada 2 — melhorias a partir do feedback', () => {
  it('coordenação corrige registro com justificativa e a dose pode ser registrada de novo', async () => {
    const tokenLucas = await entrar();
    const tokenCamila = await entrar(CAMILA);
    await request(app).post('/api/checklist/m1/confirmar').set('Authorization', `Bearer ${tokenLucas}`).expect(200);

    const res = await request(app)
      .post('/api/checklist/m1/corrigir')
      .set('Authorization', `Bearer ${tokenCamila}`)
      .send({ justificativa: 'Toque por engano: dose ainda não administrada.' })
      .expect(200);
    assert.equal(res.body.item.status, 'PENDENTE');
    assert.equal(res.body.item.aplicadoPor, null);
    assert.match(res.body.item.ultimaCorrecao, /corrigido por Camila/);
    assert.deepEqual(res.body.progresso, { total: 3, aplicados: 1 });

    // O registro original fica preservado na auditoria
    const resumo = await request(app).get('/api/resumo').set('Authorization', `Bearer ${tokenCamila}`).expect(200);
    assert.equal(resumo.body.ultimosRegistros[0].tipo, 'CORRECAO');
    assert.equal(resumo.body.ultimosRegistros[1].tipo, 'MEDICACAO');

    await request(app).post('/api/checklist/m1/confirmar').set('Authorization', `Bearer ${tokenLucas}`).expect(200);
  });

  it('voluntário não pode corrigir registros (403)', async () => {
    const token = await entrar();
    const res = await request(app)
      .post('/api/checklist/m2/corrigir')
      .set('Authorization', `Bearer ${token}`)
      .send({ justificativa: 'Tentativa sem permissão de correção.' })
      .expect(403);
    assert.match(res.body.mensagem, /Apenas a coordenação/);
  });

  it('correção exige justificativa e só vale para item já aplicado', async () => {
    const token = await entrar(CAMILA);
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/api/checklist/m2/corrigir').set(auth).send({ justificativa: 'curta' }).expect(400);
    await request(app).post('/api/checklist/m2/corrigir').set(auth).send({}).expect(400);
    await request(app)
      .post('/api/checklist/m1/corrigir')
      .set(auth)
      .send({ justificativa: 'Item ainda pendente, nada a corrigir.' })
      .expect(409);
  });

  it('saída registra o motivo informado e rejeita motivo inválido', async () => {
    const token = await entrar();
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app)
      .post('/api/estoque/e2/movimentar')
      .set(auth)
      .send({ tipo: 'saida', quantidade: 5, motivo: 'doacao' })
      .expect(200);
    assert.equal(res.body.movimentacao.motivo, 'doacao');

    const padrao = await request(app)
      .post('/api/estoque/e2/movimentar')
      .set(auth)
      .send({ tipo: 'saida', quantidade: 1 })
      .expect(200);
    assert.equal(padrao.body.movimentacao.motivo, 'consumo');

    const invalido = await request(app)
      .post('/api/estoque/e2/movimentar')
      .set(auth)
      .send({ tipo: 'saida', quantidade: 1, motivo: 'furto' })
      .expect(400);
    assert.equal(invalido.body.codigo, 'MOTIVO_INVALIDO');
  });
});

describe('Resumo consolidado', () => {
  it('reflete progresso das medicações, alertas e últimos registros', async () => {
    const token = await entrar();
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/api/checklist/m1/confirmar').set(auth).expect(200);
    await request(app).post('/api/estoque/e1/movimentar').set(auth).send({ tipo: 'entrada', quantidade: 8 }).expect(200);

    const res = await request(app).get('/api/resumo').set(auth).expect(200);
    assert.equal(res.body.institucional.animaisAbrigados, 42);
    assert.deepEqual(res.body.medicacoes.manha, { total: 3, aplicados: 2 });
    assert.equal(res.body.medicacoes.aplicadasDia, 2);
    assert.equal(res.body.estoque.totalCriticos, 1);
    assert.equal(res.body.ultimosRegistros.length, 2);
    assert.equal(res.body.ultimosRegistros[0].tipo, 'ESTOQUE');
  });

  it('health check responde sem autenticação', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  it('rota de API inexistente retorna 404 em JSON', async () => {
    const res = await request(app).get('/api/nao-existe').expect(404);
    assert.equal(res.body.mensagem, 'Recurso não encontrado.');
  });
});
