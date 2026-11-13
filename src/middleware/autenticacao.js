'use strict';

const AppError = require('../utils/AppError');
const authService = require('../services/authService');

/** Exige cabeçalho "Authorization: Bearer <token>" com sessão válida. */
function exigirAutenticacao(req, _res, next) {
  const [esquema, token] = (req.get('authorization') || '').split(' ');
  const usuario = esquema === 'Bearer' && token ? authService.validarSessao(token) : null;

  if (!usuario) {
    return next(
      new AppError(401, 'Sua sessão expirou ou não é válida. Entre novamente para continuar.', 'SESSAO_INVALIDA')
    );
  }
  req.usuario = usuario;
  req.token = token;
  return next();
}

module.exports = { exigirAutenticacao };
