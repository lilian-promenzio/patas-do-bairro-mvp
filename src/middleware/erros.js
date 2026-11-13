'use strict';

const AppError = require('../utils/AppError');

function rotaApiNaoEncontrada(_req, _res, next) {
  next(new AppError(404, 'Recurso não encontrado.', 'NAO_ENCONTRADO'));
}

/**
 * Tratador central: responde sempre JSON com mensagem amigável.
 * Nunca expõe stack trace, nomes de arquivos ou detalhes internos (RNF01/RNF02).
 */
// eslint-disable-next-line no-unused-vars
function tratarErros(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ codigo: err.codigo, mensagem: err.message });
  }

  if (err && err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ codigo: 'DADOS_INVALIDOS', mensagem: 'Não foi possível ler os dados enviados. Revise e tente novamente.' });
  }

  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ codigo: 'DADOS_GRANDES', mensagem: 'Os dados enviados são grandes demais.' });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error('[erro inesperado]', err);
  }
  return res
    .status(500)
    .json({ codigo: 'ERRO_INTERNO', mensagem: 'Ocorreu um erro inesperado. Tente novamente em instantes.' });
}

module.exports = { rotaApiNaoEncontrada, tratarErros };
