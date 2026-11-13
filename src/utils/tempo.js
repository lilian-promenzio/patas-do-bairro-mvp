'use strict';

const FUSO = 'America/Sao_Paulo';

const formatadorHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: FUSO,
});

/** Retorna "HH:MM" no fuso horário do abrigo. */
function horaLocal(data = new Date()) {
  return formatadorHora.format(data);
}

module.exports = { horaLocal, FUSO };
