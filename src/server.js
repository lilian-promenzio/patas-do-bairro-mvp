'use strict';

const app = require('./app');

const PORTA = Number(process.env.PORT) || 3000;

app.listen(PORTA, () => {
  console.log(`Instituto Patas do Bairro rodando em http://localhost:${PORTA}`);
});
