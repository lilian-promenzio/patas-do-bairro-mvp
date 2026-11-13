'use strict';

/**
 * Erro de negócio com status HTTP e mensagem amigável ao usuário.
 * A mensagem é exibida na interface — nunca coloque detalhes técnicos aqui.
 */
class AppError extends Error {
  constructor(status, mensagem, codigo = 'ERRO') {
    super(mensagem);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
  }
}

module.exports = AppError;
