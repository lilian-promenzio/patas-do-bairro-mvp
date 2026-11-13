# Instituto Patas do Bairro — Gestão e Cuidado Animal

[![CI](https://github.com/lilian-promenzio/patas-do-bairro-mvp/actions/workflows/ci.yml/badge.svg)](https://github.com/lilian-promenzio/patas-do-bairro-mvp/actions/workflows/ci.yml)

MVP de uma **Aplicação Web Progressiva (PWA) mobile-first** para apoiar a rotina de voluntários e coordenação de um abrigo animal comunitário: checklist de medicações por turno, registro auditável de aplicações e controle de estoque com alertas críticos.

Alinhado ao **ODS 11 — Cidades e Comunidades Sustentáveis (Meta 11.6)**: reduzir o impacto ambiental negativo nas cidades, incluindo o manejo responsável de animais em situação de abandono.

> Todos os dados (pessoas, animais, insumos e indicadores) são **100% fictícios**.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Arquitetura | Monólito modular Web/PWA |
| Back-end | Node.js + Express 5 (API REST em rotas → serviços → store em memória) |
| Front-end | HTML5 semântico, CSS3 puro mobile-first, JavaScript Vanilla, `manifest.json` + `sw.js` |
| Testes | Node Test Runner nativo (`node --test`) + `supertest` |
| CI | GitHub Actions (Node 22 e 24) |

## Como executar

Requisitos: Node.js 20 ou superior (recomendado 22+).

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # reinicia ao salvar arquivos
npm test           # suíte de testes de integração
```

Use outra porta com `PORT=8080 npm start`.

### Acesso de demonstração

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Voluntário | `lucas.ferreira@patasdobairro.org.br` | `Patas2026#` |
| Coordenação | `camila.santos@patasdobairro.org.br` | `Patas2026#` |

Na tela de login há o atalho **"Preencher dados de demonstração"**.

## Estrutura

```
.
├── .github/workflows/ci.yml     # Integração contínua
├── public/                      # Front-end PWA (servido como estático)
│   ├── index.html               # SPA: Login, Checklist, Estoque, Resumo
│   ├── css/styles.css           # Tema claro de alto contraste
│   ├── js/app.js                # Lógica da interface (Vanilla JS)
│   ├── icons/icon.svg
│   ├── manifest.json
│   └── sw.js                    # Service Worker (app shell em cache)
├── src/
│   ├── app.js                   # Configuração do Express (exportado p/ testes)
│   ├── server.js                # Ponto de entrada (listen)
│   ├── data/store.js            # Dados fictícios em memória + resetStore()
│   ├── middleware/              # Autenticação e tratamento central de erros
│   ├── routes/                  # Rotas REST
│   ├── services/                # Regras de negócio
│   └── utils/                   # AppError, formatação de horário
└── tests/api.test.js            # Testes de integração
```

## API

Todas as rotas, exceto `POST /api/login`, exigem `Authorization: Bearer <token>`.
Erros sempre respondem `{ "codigo": "...", "mensagem": "..." }` — mensagem amigável, sem stack trace.

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/login` | **RF01** — `{ email, senha }` → `{ token, usuario }` (perfil `voluntario` ou `coordenacao`). Credencial inválida → `401` genérico. |
| `GET` | `/api/me` | Dados do usuário da sessão. |
| `POST` | `/api/logout` | Encerra a sessão (`204`). |
| `GET` | `/api/checklist?turno=manha\|tarde` | **RF02** — cartões do turno com baia, animal/grupo, espécie, medicamento/dosagem, via e status (`PENDENTE`/`APLICADO`), além do progresso. |
| `POST` | `/api/checklist/:id/confirmar` | **RF03** — registra autor e horário (`"Aplicado às 08:42 por Lucas"`). Dose já aplicada → `409`. |
| `GET` | `/api/estoque?categoria=todos\|racao\|medicamento` | **RF04** — insumos com `saldoAtual`, `estoqueMinimo` e `status` (`CRITICO` se `saldoAtual < estoqueMinimo`, senão `NORMAL`) + alerta global. |
| `POST` | `/api/estoque/:id/movimentar` | **RF04** — `{ tipo: 'entrada'\|'saida', quantidade }`. Exige `quantidade > 0` (inteira para frascos) e bloqueia saída maior que o saldo → `400` com orientação. |
| `GET` | `/api/resumo` | Indicadores consolidados (fictícios + progresso do dia + alertas + últimos registros). |

## Requisitos não funcionais atendidos

- **RNF01/RNF02 — Mensagens seguras e orientadas:** tratador central de erros; login não revela se o e-mail existe (mesma mensagem e tempo de resposta semelhante); validações retornam o que fazer em seguida.
- **RNF04 — Acessibilidade em campo:**
  - Tema claro de alto contraste (texto ≥ 4,5:1; cabeçalho `#0B3954` com texto branco ≈ 12:1).
  - Botões, campos, abas e pílulas com área mínima de **48 × 48 px** e **8 px** de espaçamento.
  - **Redundância multissensorial:** todo status usa **ícone + cor + texto** (`⚠ CRÍTICO`, `✓ NORMAL`, `🕒 PENDENTE`, `✓ APLICADO`, banner `ALERTA: X itens abaixo do estoque mínimo`). Abas e filtros ativos também têm indicação além da cor (barra, sublinhado, ✓).
  - Rótulos persistentes acima dos campos, botão *Exibir/Ocultar senha*, link "Pular para o conteúdo", foco visível, regiões `aria-live`, modal nativo `<dialog>` com retorno de foco, `prefers-reduced-motion`.
- **Segurança básica:** senhas com `scrypt` + `timingSafeEqual`, tokens aleatórios de 256 bits com expiração, Content-Security-Policy restritiva, renderização do front-end sem `innerHTML` com dados.
- **Desempenho em 4G:** sem frameworks; Service Worker com cache do app shell (a API nunca é servida do cache).

## Limitações conhecidas do MVP

- Dados em memória: reiniciar o servidor restaura o estado inicial e encerra as sessões.
- O checklist não "vira o dia" automaticamente; não há distinção de permissões entre perfis além da exibição.
- Ícone do PWA apenas em SVG; alguns navegadores podem exigir PNG 192/512 px para instalação.

Próximos passos sugeridos: persistência (SQLite/PostgreSQL), limite de tentativas de login, permissões por perfil (ex.: só coordenação ajusta estoque mínimo) e modo offline com fila de sincronização.

## Licença

MIT
