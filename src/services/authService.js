'use strict';

const crypto = require('node:crypto');
const { db, gerarHashSenha } = require('../data/store');

const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000; // um plantão estendido

const ROTULOS_PERFIL = {
  voluntario: 'Voluntário',
  coordenacao: 'Coordenação',
};

// Hash fictício usado quando o e-mail não existe, para que o tempo de resposta
// não revele se a conta existe ou não.
const SALT_FICTICIO = crypto.randomBytes(16).toString('hex');
const HASH_FICTICIO = gerarHashSenha('senha-inexistente', SALT_FICTICIO);

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    nomeCurto: usuario.nomeCurto,
    email: usuario.email,
    perfil: usuario.perfil,
    perfilRotulo: ROTULOS_PERFIL[usuario.perfil],
  };
}

function senhaConfere(senha, salt, hashEsperado) {
  const calculado = Buffer.from(gerarHashSenha(senha, salt), 'hex');
  const esperado = Buffer.from(hashEsperado, 'hex');
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

/**
 * Valida credenciais. Retorna { token, usuario } ou null (sem dizer o motivo).
 */
function autenticar(email, senha) {
  const emailNormalizado = String(email).trim().toLowerCase();
  const usuario = db.usuarios.find((u) => u.email === emailNormalizado);

  const ok = usuario
    ? senhaConfere(String(senha), usuario.salt, usuario.senhaHash)
    : senhaConfere(String(senha), SALT_FICTICIO, HASH_FICTICIO) && false;

  if (!ok) return null;

  const token = crypto.randomBytes(32).toString('hex');
  db.sessoes.set(token, { usuarioId: usuario.id, expiraEm: Date.now() + DURACAO_SESSAO_MS });
  return { token, usuario: usuarioPublico(usuario) };
}

/** Retorna o usuário público da sessão ou null se inválida/expirada. */
function validarSessao(token) {
  const sessao = db.sessoes.get(token);
  if (!sessao) return null;
  if (sessao.expiraEm < Date.now()) {
    db.sessoes.delete(token);
    return null;
  }
  const usuario = db.usuarios.find((u) => u.id === sessao.usuarioId);
  return usuario ? usuarioPublico(usuario) : null;
}

function encerrarSessao(token) {
  db.sessoes.delete(token);
}

module.exports = { autenticar, validarSessao, encerrarSessao, usuarioPublico };
