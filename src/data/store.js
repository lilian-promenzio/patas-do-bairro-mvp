'use strict';

/**
 * Armazenamento em memória do MVP.
 * Todos os dados são 100% fictícios e servem apenas para demonstração.
 * Ao reiniciar o servidor, o estado volta ao inicial (ver resetStore).
 */

const crypto = require('node:crypto');

const SENHA_DEMO = 'Patas2026#';

function gerarHashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, 32).toString('hex');
}

function criarUsuario(dados, senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return Object.freeze({ ...dados, salt, senhaHash: gerarHashSenha(senha, salt) });
}

// Usuários não mudam durante a execução: o hash é calculado uma única vez.
const usuarios = Object.freeze([
  criarUsuario(
    {
      id: 'u1',
      nome: 'Lucas Ferreira',
      nomeCurto: 'Lucas',
      email: 'lucas.ferreira@patasdobairro.org.br',
      perfil: 'voluntario',
    },
    SENHA_DEMO
  ),
  criarUsuario(
    {
      id: 'u2',
      nome: 'Camila Santos',
      nomeCurto: 'Camila',
      email: 'camila.santos@patasdobairro.org.br',
      perfil: 'coordenacao',
    },
    SENHA_DEMO
  ),
]);

function checklistInicial() {
  return [
    // ---- Turno da manhã ----
    {
      id: 'm1',
      turno: 'manha',
      baia: 'Baia 03',
      animal: 'Ninhada Mel',
      especie: 'Cão',
      medicamento: 'Vermífugo Oral',
      dosagem: '5 ml',
      via: 'Via oral',
      status: 'PENDENTE',
      aplicadoPor: null,
      horario: null,
      aplicadoEm: null,
    },
    {
      id: 'm2',
      turno: 'manha',
      baia: 'Baia 01',
      animal: 'Thor',
      especie: 'Cão',
      medicamento: 'Antibiótico',
      dosagem: '1 comp',
      via: 'Misturar na ração',
      status: 'APLICADO',
      aplicadoPor: 'Lucas',
      horario: '08:42',
      aplicadoEm: null,
    },
    {
      id: 'm3',
      turno: 'manha',
      baia: 'Baia 05',
      animal: 'Luna',
      especie: 'Gato',
      medicamento: 'Colírio Oftálmico',
      dosagem: '2 gotas',
      via: 'Aplicação tópica',
      status: 'PENDENTE',
      aplicadoPor: null,
      horario: null,
      aplicadoEm: null,
    },
    // ---- Turno da tarde ----
    {
      id: 't1',
      turno: 'tarde',
      baia: 'Baia 01',
      animal: 'Thor',
      especie: 'Cão',
      medicamento: 'Antibiótico',
      dosagem: '1 comp',
      via: 'Misturar na ração',
      status: 'PENDENTE',
      aplicadoPor: null,
      horario: null,
      aplicadoEm: null,
    },
    {
      id: 't2',
      turno: 'tarde',
      baia: 'Baia 04',
      animal: 'Pipoca',
      especie: 'Cão',
      medicamento: 'Anti-inflamatório',
      dosagem: '1/2 comp',
      via: 'Via oral',
      status: 'PENDENTE',
      aplicadoPor: null,
      horario: null,
      aplicadoEm: null,
    },
  ];
}

function estoqueInicial() {
  return [
    {
      id: 'e1',
      nome: 'Ração Filhote',
      categoria: 'racao',
      local: 'Baia 03 / Baia 01',
      unidade: 'kg',
      unidadeSingular: 'kg',
      permiteFracao: true,
      saldoAtual: 4,
      estoqueMinimo: 10,
    },
    {
      id: 'e2',
      nome: 'Ração Adulto',
      categoria: 'racao',
      local: 'Baia 01 / Baia 04',
      unidade: 'kg',
      unidadeSingular: 'kg',
      permiteFracao: true,
      saldoAtual: 45,
      estoqueMinimo: 20,
    },
    {
      id: 'e3',
      nome: 'Vermífugo Oral',
      categoria: 'medicamento',
      local: 'Enfermaria',
      unidade: 'frascos',
      unidadeSingular: 'frasco',
      permiteFracao: false,
      saldoAtual: 3,
      estoqueMinimo: 5,
    },
  ];
}

/** Indicadores institucionais fictícios exibidos na aba Resumo. */
const indicadoresInstitucionais = Object.freeze({
  animaisAbrigados: 42,
  caes: 31,
  gatos: 11,
  adocoesMes: 7,
  castracoesMes: 12,
  voluntariosAtivos: 18,
});

// Estado mutável (mesmo objeto durante toda a execução; resetStore só troca o conteúdo).
const db = {
  usuarios,
  indicadoresInstitucionais,
  checklist: [],
  checklistData: null, // dia operacional (AAAA-MM-DD) a que o checklist se refere
  estoque: [],
  movimentacoes: [],
  auditoria: [],
  sessoes: new Map(),
};

function resetStore() {
  db.checklist = checklistInicial().map((item) => ({ ...item, correcoes: [] }));
  db.checklistData = null; // definido no primeiro acesso (dados iniciais = dia corrente)
  db.estoque = estoqueInicial();
  db.movimentacoes = [];
  db.auditoria = [];
  db.sessoes.clear();
}

resetStore();

module.exports = { db, resetStore, gerarHashSenha, SENHA_DEMO };
