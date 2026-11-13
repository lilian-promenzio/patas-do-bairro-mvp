'use strict';

const { db } = require('../data/store');
const AppError = require('../utils/AppError');
const { horaLocal } = require('../utils/tempo');

const CATEGORIAS = ['todos', 'racao', 'medicamento'];
const ROTULOS_CATEGORIA = { racao: 'Ração', medicamento: 'Medicamento' };
const TIPOS = { entrada: 'Entrada', saida: 'Saída' };
// Rodada 2 — motivo da saída, para entender para onde vai o estoque
const MOTIVOS_SAIDA = {
  consumo: 'Consumo',
  perda: 'Perda/avaria',
  doacao: 'Doação a outro abrigo',
  vencimento: 'Vencimento',
};

const arredondar = (n) => Math.round(n * 1000) / 1000;
const formatarNumero = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function formatarQuantidade(n, item) {
  return `${formatarNumero(n)} ${n === 1 ? item.unidadeSingular : item.unidade}`;
}

function calcularStatus(item) {
  return item.saldoAtual < item.estoqueMinimo ? 'CRITICO' : 'NORMAL';
}

function apresentarItem(item) {
  return {
    ...item,
    categoriaRotulo: ROTULOS_CATEGORIA[item.categoria],
    status: calcularStatus(item),
  };
}

function resumoAlertas() {
  const criticos = db.estoque.filter((i) => calcularStatus(i) === 'CRITICO');
  return {
    totalCriticos: criticos.length,
    criticos: criticos.map((i) => ({ id: i.id, nome: i.nome })),
  };
}

function listar(categoria = 'todos') {
  if (!CATEGORIAS.includes(categoria)) {
    throw new AppError(400, 'Filtro inválido. Use Todos, Ração ou Medicamento.', 'CATEGORIA_INVALIDA');
  }
  const itens = db.estoque
    .filter((i) => categoria === 'todos' || i.categoria === categoria)
    .map(apresentarItem);
  return { categoria, itens, alerta: resumoAlertas() };
}

function validarMovimento(item, tipo, quantidade, motivo) {
  if (!Object.hasOwn(TIPOS, tipo)) {
    throw new AppError(400, 'Tipo de movimentação inválido. Escolha Entrada ou Saída.', 'TIPO_INVALIDO');
  }
  if (tipo === 'saida' && !Object.hasOwn(MOTIVOS_SAIDA, motivo)) {
    throw new AppError(400, 'Motivo da saída inválido. Escolha Consumo, Perda/avaria, Doação ou Vencimento.', 'MOTIVO_INVALIDO');
  }
  if (typeof quantidade !== 'number' || !Number.isFinite(quantidade) || quantidade <= 0) {
    throw new AppError(400, 'Informe uma quantidade maior que zero.', 'QUANTIDADE_INVALIDA');
  }
  if (!item.permiteFracao && !Number.isInteger(quantidade)) {
    throw new AppError(
      400,
      `Para ${item.nome}, informe um número inteiro de ${item.unidade}.`,
      'QUANTIDADE_INVALIDA'
    );
  }
  if (tipo === 'saida' && quantidade > item.saldoAtual) {
    throw new AppError(
      400,
      `Saída de ${formatarQuantidade(quantidade, item)} maior que o saldo disponível ` +
        `(${formatarQuantidade(item.saldoAtual, item)}). Ajuste a quantidade ou registre uma entrada antes.`,
      'SALDO_INSUFICIENTE'
    );
  }
}

function movimentar(id, { tipo, quantidade, motivo } = {}, usuario, agora = new Date()) {
  const item = db.estoque.find((i) => i.id === id);
  if (!item) {
    throw new AppError(404, 'Insumo não encontrado. Atualize a lista e tente novamente.', 'NAO_ENCONTRADO');
  }
  // Sem motivo informado, a saída é considerada consumo (compatível com a rodada 1).
  const motivoSaida = tipo === 'saida' ? (motivo ?? 'consumo') : null;
  validarMovimento(item, tipo, quantidade, motivoSaida);

  const saldoAnterior = item.saldoAtual;
  item.saldoAtual = arredondar(tipo === 'entrada' ? saldoAnterior + quantidade : saldoAnterior - quantidade);

  const registro = {
    id: `mov${db.movimentacoes.length + 1}`,
    itemId: item.id,
    tipo,
    motivo: motivoSaida,
    quantidade,
    saldoAnterior,
    saldoAtual: item.saldoAtual,
    usuarioId: usuario.id,
    usuario: usuario.nomeCurto,
    horario: horaLocal(agora),
    em: agora.toISOString(),
  };
  db.movimentacoes.push(registro);
  db.auditoria.push({
    tipo: 'ESTOQUE',
    referencia: item.id,
    descricao: `${TIPOS[tipo]}${motivoSaida ? ` (${MOTIVOS_SAIDA[motivoSaida]})` : ''} de ${formatarQuantidade(quantidade, item)} — ${item.nome}`,
    usuarioId: usuario.id,
    usuario: usuario.nomeCurto,
    horario: registro.horario,
    em: registro.em,
  });

  const apresentado = apresentarItem(item);
  const aviso =
    apresentado.status === 'CRITICO'
      ? ` Atenção: ${item.nome} está abaixo do estoque mínimo.`
      : '';

  return {
    item: apresentado,
    movimentacao: registro,
    mensagem: `${TIPOS[tipo]} registrada. Saldo atual de ${item.nome}: ${formatarQuantidade(item.saldoAtual, item)}.${aviso}`,
    alerta: resumoAlertas(),
  };
}

module.exports = { listar, movimentar, calcularStatus, resumoAlertas, MOTIVOS_SAIDA };
