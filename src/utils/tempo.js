'use strict';

const FUSO = 'America/Sao_Paulo';

const formatadorHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: FUSO,
});

// en-CA formata como AAAA-MM-DD
const formatadorData = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: FUSO,
});

/** Retorna "HH:MM" no fuso horário do abrigo. */
function horaLocal(data = new Date()) {
  return formatadorHora.format(data);
}

/** Retorna "AAAA-MM-DD" no fuso horário do abrigo (dia operacional). */
function dataLocal(data = new Date()) {
  return formatadorData.format(data);
}

module.exports = { horaLocal, dataLocal, FUSO };
