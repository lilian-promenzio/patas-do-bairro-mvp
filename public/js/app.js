/* Instituto Patas do Bairro — SPA em JavaScript Vanilla */
'use strict';

(() => {
  const CHAVE_SESSAO = 'patas.sessao';
  const CHAVE_PREFS = 'patas.preferencias';
  const CATEGORIAS = ['todos', 'racao', 'medicamento'];
  const DEMO = { email: 'lucas.ferreira@patasdobairro.org.br', senha: 'Patas2026#' };
  const VIEWS = ['login', 'checklist', 'estoque', 'resumo'];
  const SVGNS = 'http://www.w3.org/2000/svg';

  const state = {
    token: null,
    usuario: null,
    view: 'login',
    turno: turnoSalvoDeHoje() || turnoAtual(),
    categoria: CATEGORIAS.includes(lerPrefs().categoria) ? lerPrefs().categoria : 'todos',
    estoque: [],
    movimento: null, // { item, tipo }
    correcao: null, // item em correção
    origemFoco: null,
  };

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  // ------------------------------------------------------------------
  // Utilitários de DOM (sem innerHTML com dados → sem risco de XSS)
  // ------------------------------------------------------------------
  function icone(nome, classe = 'icon') {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', classe);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', `#i-${nome}`);
    svg.appendChild(use);
    return svg;
  }

  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) {
      if (f == null || f === false) continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  const SELOS = {
    PENDENTE: { icone: 'clock', texto: 'PENDENTE', classe: 'badge-pending' },
    APLICADO: { icone: 'check', texto: 'APLICADO', classe: 'badge-ok' },
    CRITICO: { icone: 'alert', texto: 'CRÍTICO', classe: 'badge-critical' },
    NORMAL: { icone: 'check', texto: 'NORMAL', classe: 'badge-ok' },
  };

  function selo(status) {
    const s = SELOS[status];
    return h('span', { class: `badge ${s.classe}` }, icone(s.icone, 'icon icon-sm'), h('span', { text: s.texto }));
  }

  const formatarNumero = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const formatarQtd = (n, item) => `${formatarNumero(n)} ${Number(n) === 1 ? item.unidadeSingular : item.unidade}`;
  const plural = (n, singular, pluralTxt) => (n === 1 ? singular : pluralTxt);

  // ---- Rodada 2: lembrar o filtro e o turno escolhidos (só conveniência local)
  function lerPrefs() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}') || {};
    } catch {
      return {};
    }
  }

  function salvarPref(chave, valor) {
    try {
      localStorage.setItem(CHAVE_PREFS, JSON.stringify({ ...lerPrefs(), [chave]: valor }));
    } catch {
      /* armazenamento indisponível: segue sem lembrar */
    }
  }

  function diaHoje() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  }

  /** O turno escolhido só é lembrado no mesmo dia; num novo dia vale o horário atual. */
  function turnoSalvoDeHoje() {
    const t = lerPrefs().turno;
    return t && t.dia === diaHoje() && ['manha', 'tarde'].includes(t.valor) ? t.valor : null;
  }

  function turnoAtual() {
    const hora = Number(
      new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date())
    );
    return hora < 12 ? 'manha' : 'tarde';
  }

  function dataAtualTexto() {
    const txt = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  // ------------------------------------------------------------------
  // Comunicação com a API
  // ------------------------------------------------------------------
  class ApiError extends Error {
    constructor(status, mensagem) {
      super(mensagem);
      this.status = status;
    }
  }

  async function api(caminho, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    let res;
    try {
      res = await fetch(caminho, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
    }

    let dados = null;
    if (res.status !== 204) {
      try {
        dados = await res.json();
      } catch {
        dados = null;
      }
    }

    if (!res.ok) {
      const msg = (dados && dados.mensagem) || 'Não foi possível concluir a operação. Tente novamente.';
      if (res.status === 401 && caminho !== '/api/login') {
        encerrarSessaoLocal('Sua sessão expirou. Entre novamente para continuar.');
      }
      throw new ApiError(res.status, msg);
    }
    return dados;
  }

  // ------------------------------------------------------------------
  // Feedback global (toast)
  // ------------------------------------------------------------------
  let temporizadorToast;
  function avisar(mensagem, tipo = 'ok') {
    const toast = $('#toast');
    toast.replaceChildren(
      icone(tipo === 'erro' ? 'alert' : 'check'),
      h('p', { text: mensagem }),
      h(
        'button',
        { type: 'button', class: 'toast-fechar', 'aria-label': 'Fechar aviso', onclick: () => (toast.hidden = true) },
        icone('close')
      )
    );
    toast.classList.toggle('is-error', tipo === 'erro');
    toast.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => {
      toast.hidden = true;
    }, 4500);
  }

  /** Anuncia para leitores de tela sem cobrir nada na tela. */
  function anunciar(mensagem) {
    const regiao = $('#anuncio');
    regiao.textContent = '';
    setTimeout(() => {
      regiao.textContent = mensagem;
    }, 50);
  }

  function estadoCarregando(container, texto = 'Carregando…') {
    container.replaceChildren(h('p', { class: 'state-msg' }, icone('clock'), texto));
  }

  function estadoErro(container, erro, tentarNovamente) {
    container.replaceChildren(
      h(
        'div',
        { class: 'state-msg state-error', role: 'alert' },
        icone('alert'),
        h('span', { text: erro.message }),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: tentarNovamente }, 'Tentar novamente')
      )
    );
  }

  // ------------------------------------------------------------------
  // Sessão e navegação
  // ------------------------------------------------------------------
  function salvarSessao() {
    try {
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ token: state.token, usuario: state.usuario }));
    } catch {
      /* armazenamento indisponível: a sessão vale só enquanto a página estiver aberta */
    }
  }

  function lerSessao() {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null');
    } catch {
      return null;
    }
  }

  function limparSessao() {
    try {
      sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* ignora */
    }
  }

  function encerrarSessaoLocal(mensagem) {
    state.token = null;
    state.usuario = null;
    limparSessao();
    if ($('#modal-movimento').open) $('#modal-movimento').close();
    mostrarView('login');
    if (mensagem) mostrarErroLogin(mensagem);
  }

  function entrarNoApp() {
    $('#toast').hidden = true; // não leva avisos da sessão anterior
    $('#usuario-nome').textContent = state.usuario.nome;
    $('#usuario-perfil').textContent = state.usuario.perfilRotulo;
    $('#data-atual').textContent = dataAtualTexto();
    mostrarView('checklist');
  }

  function mostrarView(nome, { focar = true } = {}) {
    state.view = nome;
    const logado = nome !== 'login';

    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== nome;
    $('#bottom-nav').hidden = !logado;
    $('#header-meta').hidden = !logado;
    $('#btn-sair').hidden = !logado;

    for (const btn of $$('.nav-btn')) {
      if (btn.dataset.view === nome) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }

    atualizarAlturaCabecalho();
    window.scrollTo(0, 0);

    if (nome === 'checklist') carregarChecklist();
    if (nome === 'estoque') carregarEstoque();
    if (nome === 'resumo') carregarResumo();

    if (focar && logado) $(`#titulo-${nome}`).focus({ preventScroll: true });
    document.title = logado ? `${$(`#titulo-${nome}`).textContent} — Patas do Bairro` : 'Entrar — Patas do Bairro';
  }

  function atualizarAlturaCabecalho() {
    const altura = $('#app-header').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-h', `${Math.round(altura)}px`);
  }

  // ------------------------------------------------------------------
  // TELA 1 — Login (RF01)
  // ------------------------------------------------------------------
  function mostrarErroLogin(mensagem) {
    const caixa = $('#login-erro');
    $('#login-erro-texto').textContent = mensagem;
    caixa.hidden = false;
  }

  function limparErroLogin() {
    $('#login-erro').hidden = true;
    $('#login-email').removeAttribute('aria-invalid');
    $('#login-senha').removeAttribute('aria-invalid');
  }

  async function aoEnviarLogin(evento) {
    evento.preventDefault();
    limparErroLogin();

    const email = $('#login-email').value.trim();
    const senha = $('#login-senha').value;

    if (!email || !senha) {
      if (!email) $('#login-email').setAttribute('aria-invalid', 'true');
      if (!senha) $('#login-senha').setAttribute('aria-invalid', 'true');
      mostrarErroLogin('Preencha seu e-mail e sua senha para entrar.');
      (!email ? $('#login-email') : $('#login-senha')).focus();
      return;
    }

    const botao = $('#btn-entrar');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      const sessao = await api('/api/login', { method: 'POST', body: { email, senha } });
      state.token = sessao.token;
      state.usuario = sessao.usuario;
      salvarSessao();
      $('#form-login').reset();
      definirVisibilidadeSenha(false);
      entrarNoApp();
    } catch (erro) {
      mostrarErroLogin(erro.message);
      $('#login-senha').value = '';
      $('#login-senha').focus();
    } finally {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  }

  function definirVisibilidadeSenha(visivel) {
    const campo = $('#login-senha');
    const botao = $('#btn-toggle-senha');
    campo.type = visivel ? 'text' : 'password';
    botao.setAttribute('aria-pressed', String(visivel));
    botao.replaceChildren(icone(visivel ? 'eye-off' : 'eye'), h('span', { text: visivel ? 'Ocultar' : 'Exibir' }));
    botao.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Exibir senha');
  }

  async function sair() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* mesmo offline, a sessão local é encerrada */
    }
    encerrarSessaoLocal();
    avisar('Você saiu do sistema com segurança.');
    $('#login-email').focus();
  }

  // ------------------------------------------------------------------
  // TELA 2 — Checklist diário (RF02 / RF03)
  // ------------------------------------------------------------------
  function selecionarTurno(turno) {
    state.turno = turno;
    salvarPref('turno', { valor: turno, dia: diaHoje() });
    for (const btn of $$('.segmented-btn')) btn.setAttribute('aria-pressed', String(btn.dataset.turno === turno));
    carregarChecklist();
  }

  async function carregarChecklist({ focarItemId } = {}) {
    const lista = $('#lista-checklist');
    if (!lista.childElementCount) estadoCarregando(lista);
    lista.setAttribute('aria-busy', 'true');
    try {
      const dados = await api(`/api/checklist?turno=${encodeURIComponent(state.turno)}`);
      if (dados.turno !== state.turno) return; // resposta de um turno anterior
      renderizarChecklist(dados);
      if (focarItemId) {
        const card = document.getElementById(`med-${focarItemId}`);
        if (card) card.focus();
      }
    } catch (erro) {
      if (erro.status !== 401) estadoErro(lista, erro, () => carregarChecklist());
    } finally {
      lista.removeAttribute('aria-busy');
    }
  }

  function renderizarChecklist({ itens, total, aplicados, turnoRotulo }) {
    $('#progresso-texto').textContent = `${aplicados} de ${total} ${plural(total, 'medicação aplicada', 'medicações aplicadas')} — Turno da ${turnoRotulo}`;
    const barra = $('#progresso-barra');
    barra.setAttribute('aria-valuemax', String(total));
    barra.setAttribute('aria-valuenow', String(aplicados));
    $('#progresso-preenchimento').style.width = total ? `${(aplicados / total) * 100}%` : '0';

    const lista = $('#lista-checklist');
    if (!itens.length) {
      lista.replaceChildren(h('p', { class: 'state-msg' }, icone('info'), 'Nenhuma medicação programada para este turno.'));
      return;
    }
    lista.replaceChildren(...itens.map(cartaoMedicacao));
  }

  function cartaoMedicacao(item) {
    const aplicado = item.status === 'APLICADO';
    const tituloId = `med-titulo-${item.id}`;
    const ehCoordenacao = state.usuario && state.usuario.perfil === 'coordenacao';
    const acoes = h('div', { class: 'card-actions' });

    if (aplicado) {
      acoes.append(
        h('button', { type: 'button', class: 'btn btn-block btn-done', disabled: true }, icone('check'), 'Aplicação registrada')
      );
      if (ehCoordenacao) {
        const corrigir = h(
          'button',
          { type: 'button', class: 'btn btn-secondary btn-block', 'aria-describedby': tituloId },
          icone('undo'),
          'Corrigir registro'
        );
        corrigir.addEventListener('click', () => abrirCorrecao(item, corrigir));
        acoes.append(corrigir);
      }
    } else {
      mostrarBotaoConfirmar(item, acoes, tituloId);
    }

    return h(
      'article',
      {
        class: `card med-card ${aplicado ? 'is-done' : 'is-pending'}`,
        id: `med-${item.id}`,
        tabindex: '-1',
        'aria-labelledby': tituloId,
      },
      h('div', { class: 'card-top' }, h('span', { class: 'baia-tag', text: item.baia }), selo(item.status)),
      h(
        'h2',
        { class: 'card-title', id: tituloId },
        `${item.animal} `,
        h('span', { class: 'especie', text: `(${item.especie})` }),
        h('span', { class: 'sr-only', text: ` — ${item.baia}` })
      ),
      h(
        'dl',
        { class: 'info-list' },
        h('div', null, h('dt', { text: 'Medicamento/Dosagem' }), h('dd', { text: `${item.medicamento} — ${item.dosagem}` })),
        h('div', null, h('dt', { text: 'Via de administração' }), h('dd', { text: item.via }))
      ),
      aplicado ? h('p', { class: 'registro' }, icone('check-circle'), item.registro) : null,
      item.ultimaCorrecao ? h('p', { class: 'correcao-nota' }, icone('undo', 'icon icon-sm'), item.ultimaCorrecao) : null,
      acoes
    );
  }

  /** Etapa 1: botão largo "Confirmar Aplicação". */
  function mostrarBotaoConfirmar(item, acoes, tituloId, focar = false) {
    const botao = h(
      'button',
      { type: 'button', class: 'btn btn-primary btn-block', 'aria-describedby': tituloId },
      'Confirmar Aplicação'
    );
    botao.addEventListener('click', () => pedirConfirmacao(item, acoes, tituloId));
    acoes.replaceChildren(botao);
    if (focar) botao.focus();
  }

  /** Etapa 2 (Rodada 2): confere animal e dose antes de registrar — evita toque por engano. */
  function pedirConfirmacao(item, acoes, tituloId) {
    const sim = h('button', { type: 'button', class: 'btn btn-primary' }, icone('check'), 'Sim, registrar');
    const nao = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancelar');
    const perguntaId = `med-pergunta-${item.id}`;
    sim.setAttribute('aria-describedby', perguntaId);

    sim.addEventListener('click', () => confirmarAplicacao(item, sim, nao));
    nao.addEventListener('click', () => mostrarBotaoConfirmar(item, acoes, tituloId, true));

    acoes.replaceChildren(
      h(
        'div',
        { class: 'confirm-box', role: 'group', 'aria-labelledby': perguntaId },
        h('p', { id: perguntaId, text: `Aplicar ${item.medicamento} — ${item.dosagem} em ${item.animal} (${item.baia})?` }),
        h('div', { class: 'confirm-actions' }, nao, sim)
      )
    );
    sim.focus();
  }

  async function confirmarAplicacao(item, botao, cancelar) {
    botao.disabled = true; // impede duplo toque
    cancelar.disabled = true;
    botao.textContent = 'Registrando…';
    try {
      const res = await api(`/api/checklist/${encodeURIComponent(item.id)}/confirmar`, { method: 'POST' });
      // Rodada 2: sem aviso flutuante — o próprio cartão mostra o registro
      anunciar(`${item.animal}: ${res.item.registro}.`);
      await carregarChecklist({ focarItemId: item.id });
    } catch (erro) {
      if (erro.status === 401) return;
      avisar(erro.message, 'erro');
      if (erro.status === 409 || erro.status === 404) {
        await carregarChecklist({ focarItemId: item.id });
      } else {
        botao.disabled = false;
        cancelar.disabled = false;
        botao.replaceChildren(icone('check'), 'Sim, registrar');
      }
    }
  }

  // ----- Rodada 2: correção de registro pela coordenação -----
  function abrirCorrecao(item, origem) {
    state.correcao = item;
    state.origemFoco = origem;
    $('#corr-titulo').textContent = `Corrigir registro — ${item.animal}`;
    $('#corr-registro').textContent = `${item.medicamento} — ${item.dosagem} · ${item.registro}`;
    const campo = $('#corr-justificativa');
    campo.value = '';
    campo.removeAttribute('aria-invalid');
    validarJustificativa();
    $('#modal-correcao').showModal();
    campo.focus();
  }

  function validarJustificativa() {
    const campo = $('#corr-justificativa');
    const n = campo.value.trim().length;
    const fb = $('#corr-feedback');
    const ok = n >= 10;
    $('#btn-confirmar-correcao').disabled = !ok;
    fb.className = `field-feedback${ok ? ' is-ok' : ''}`;
    fb.replaceChildren(
      icone(ok ? 'check' : 'info', 'icon icon-sm'),
      h('span', { text: ok ? `${n}/280 caracteres` : `Descreva o motivo (faltam ${10 - n} caracteres).` })
    );
    return ok;
  }

  async function aoEnviarCorrecao(evento) {
    evento.preventDefault();
    if (!validarJustificativa()) return;
    const item = state.correcao;
    const botao = $('#btn-confirmar-correcao');
    botao.disabled = true;
    try {
      const res = await api(`/api/checklist/${encodeURIComponent(item.id)}/corrigir`, {
        method: 'POST',
        body: { justificativa: $('#corr-justificativa').value },
      });
      state.origemFoco = null;
      $('#modal-correcao').close();
      anunciar(res.mensagem);
      await carregarChecklist({ focarItemId: item.id });
    } catch (erro) {
      if (erro.status === 401) return;
      const fb = $('#corr-feedback');
      fb.className = 'field-feedback is-error';
      fb.replaceChildren(icone('alert', 'icon icon-sm'), h('span', { text: erro.message }));
      botao.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // TELA 3 — Estoque e alertas (RF04)
  // ------------------------------------------------------------------
  function selecionarCategoria(categoria) {
    state.categoria = categoria;
    salvarPref('categoria', categoria);
    for (const p of $$('.pill')) p.setAttribute('aria-pressed', String(p.dataset.categoria === categoria));
    carregarEstoque();
  }

  async function carregarEstoque({ focarItemId } = {}) {
    const lista = $('#lista-estoque');
    if (!lista.childElementCount) estadoCarregando(lista);
    lista.setAttribute('aria-busy', 'true');
    try {
      const dados = await api(`/api/estoque?categoria=${encodeURIComponent(state.categoria)}`);
      if (dados.categoria !== state.categoria) return;
      state.estoque = dados.itens;
      renderizarBanner(dados.alerta);
      renderizarEstoque(dados.itens);
      if (focarItemId) {
        const card = document.getElementById(`estoque-${focarItemId}`);
        if (card) card.focus();
      }
    } catch (erro) {
      if (erro.status !== 401) estadoErro(lista, erro, () => carregarEstoque());
    } finally {
      lista.removeAttribute('aria-busy');
    }
  }

  function renderizarBanner({ totalCriticos, criticos }) {
    const banner = $('#banner-estoque');
    const badgeNav = $('#nav-badge-estoque');
    badgeNav.hidden = totalCriticos === 0;
    badgeNav.textContent = String(totalCriticos);
    $('#nav-badge-estoque-sr').textContent = totalCriticos
      ? `, ${totalCriticos} ${plural(totalCriticos, 'item crítico', 'itens críticos')}`
      : '';

    if (totalCriticos > 0) {
      banner.className = 'banner banner-alert';
      banner.replaceChildren(
        icone('alert'),
        h(
          'div',
          null,
          h('p', { text: `ALERTA: ${totalCriticos} ${plural(totalCriticos, 'item', 'itens')} abaixo do estoque mínimo` }),
          h('p', { class: 'banner-detail', text: criticos.map((c) => c.nome).join(' · ') })
        )
      );
    } else {
      banner.className = 'banner banner-ok';
      banner.replaceChildren(icone('check-circle'), h('p', { text: 'Tudo certo: nenhum item abaixo do estoque mínimo.' }));
    }
  }

  function renderizarEstoque(itens) {
    const lista = $('#lista-estoque');
    if (!itens.length) {
      lista.replaceChildren(h('p', { class: 'state-msg' }, icone('info'), 'Nenhum insumo nesta categoria.'));
      return;
    }
    lista.replaceChildren(...itens.map(cartaoEstoque));
  }

  function cartaoEstoque(item) {
    const critico = item.status === 'CRITICO';
    const tituloId = `estoque-titulo-${item.id}`;

    const btnEntrada = h(
      'button',
      { type: 'button', class: 'btn btn-success', 'aria-describedby': tituloId },
      icone('plus'),
      'Entrada'
    );
    const btnSaida = h(
      'button',
      { type: 'button', class: 'btn btn-secondary', 'aria-describedby': tituloId, disabled: item.saldoAtual <= 0 },
      icone('minus'),
      'Saída'
    );
    btnEntrada.addEventListener('click', () => abrirModal(item, 'entrada', btnEntrada));
    btnSaida.addEventListener('click', () => abrirModal(item, 'saida', btnSaida));

    return h(
      'article',
      {
        class: `card stock-card ${critico ? 'is-critical' : 'is-normal'}`,
        id: `estoque-${item.id}`,
        tabindex: '-1',
        'aria-labelledby': tituloId,
      },
      h('div', { class: 'card-top' }, h('h2', { class: 'card-title', id: tituloId, text: item.nome }), selo(item.status)),
      h('p', { class: 'stock-meta', text: `${item.categoriaRotulo} · ${item.local}` }),
      h(
        'div',
        { class: 'stock-numbers' },
        h(
          'p',
          { class: `stock-number ${critico ? 'is-critical' : ''}` },
          h('span', { text: 'Saldo atual' }),
          h('strong', { text: formatarQtd(item.saldoAtual, item) })
        ),
        h(
          'p',
          { class: 'stock-number' },
          h('span', { text: 'Estoque mínimo' }),
          h('strong', { text: formatarQtd(item.estoqueMinimo, item) })
        )
      ),
      h('div', { class: 'stock-actions' }, btnEntrada, btnSaida)
    );
  }

  // ----- Modal de movimentação (validação em tempo real) -----
  function abrirModal(item, tipo, origem) {
    state.movimento = { item, tipo };
    state.origemFoco = origem;

    const rotuloTipo = tipo === 'entrada' ? 'Registrar entrada' : 'Registrar saída';
    $('#modal-titulo').textContent = `${rotuloTipo} — ${item.nome}`;
    $('#modal-saldo').textContent = `Saldo atual: ${formatarQtd(item.saldoAtual, item)} · Mínimo: ${formatarQtd(item.estoqueMinimo, item)}`;
    $('#mov-label').textContent = `Quantidade (${item.unidade})`;

    const campo = $('#mov-quantidade');
    campo.value = '';
    campo.inputMode = item.permiteFracao ? 'decimal' : 'numeric';
    campo.removeAttribute('aria-invalid');
    $('#mov-dica').textContent = item.permiteFracao
      ? 'Use vírgula para decimais. Ex.: 2,5'
      : `Somente números inteiros de ${item.unidade}.`;

    $('#campo-motivo').hidden = tipo !== 'saida';
    $('#mov-motivo').value = 'consumo';

    const confirmar = $('#btn-confirmar-mov');
    confirmar.className = `btn ${tipo === 'entrada' ? 'btn-success' : 'btn-primary'}`;
    confirmar.replaceChildren(icone(tipo === 'entrada' ? 'plus' : 'minus'), tipo === 'entrada' ? 'Confirmar entrada' : 'Confirmar saída');
    confirmar.disabled = true;

    definirFeedback('', null);
    $('#modal-movimento').showModal();
    campo.focus();
  }

  function fecharModal() {
    const modal = $('#modal-movimento');
    if (modal.open) modal.close();
  }

  function definirFeedback(texto, tipo) {
    const fb = $('#mov-feedback');
    fb.className = `field-feedback${tipo === 'erro' ? ' is-error' : tipo === 'ok' ? ' is-ok' : ''}`;
    if (!texto) {
      fb.replaceChildren();
      return;
    }
    fb.replaceChildren(icone(tipo === 'erro' ? 'alert' : 'info', 'icon icon-sm'), h('span', { text: texto }));
  }

  /** Retorna a quantidade válida ou null, atualizando a mensagem do campo. */
  function validarQuantidade({ mostrarVazio = false } = {}) {
    const { item, tipo } = state.movimento;
    const campo = $('#mov-quantidade');
    const bruto = campo.value.trim();
    // Rodada 2: aceita vírgula (padrão brasileiro) ou ponto como separador decimal
    const formatoValido = /^\d+([.,]\d+)?$/.test(bruto);
    const n = formatoValido ? Number(bruto.replace(',', '.')) : NaN;
    let erro = null;

    if (bruto !== '' && !formatoValido) erro = 'Digite apenas números. Use vírgula para decimais (ex.: 2,5).';
    else if (bruto === '') erro = mostrarVazio ? 'Informe a quantidade.' : null;
    else if (!Number.isFinite(n) || n <= 0) erro = 'A quantidade deve ser maior que zero.';
    else if (!item.permiteFracao && !Number.isInteger(n)) erro = `Use um número inteiro de ${item.unidade}.`;
    else if (tipo === 'saida' && n > item.saldoAtual)
      erro = `Saída maior que o saldo disponível (${formatarQtd(item.saldoAtual, item)}).`;

    const valido = !erro && bruto !== '';
    $('#btn-confirmar-mov').disabled = !valido;

    if (erro) {
      campo.setAttribute('aria-invalid', 'true');
      definirFeedback(erro, 'erro');
      return null;
    }
    campo.removeAttribute('aria-invalid');
    if (!valido) {
      definirFeedback('', null);
      return null;
    }

    const novoSaldo = Math.round((tipo === 'entrada' ? item.saldoAtual + n : item.saldoAtual - n) * 1000) / 1000;
    const ficaCritico = novoSaldo < item.estoqueMinimo;
    definirFeedback(
      `Saldo após a operação: ${formatarQtd(novoSaldo, item)}${ficaCritico ? ' (abaixo do mínimo)' : ''}`,
      ficaCritico ? 'erro' : 'ok'
    );
    // Aviso de "abaixo do mínimo" não bloqueia o envio
    $('#btn-confirmar-mov').disabled = false;
    return n;
  }

  async function aoEnviarMovimento(evento) {
    evento.preventDefault();
    const quantidade = validarQuantidade({ mostrarVazio: true });
    if (quantidade == null) {
      $('#mov-quantidade').focus();
      return;
    }

    const { item, tipo } = state.movimento;
    const botao = $('#btn-confirmar-mov');
    botao.disabled = true;
    try {
      const res = await api(`/api/estoque/${encodeURIComponent(item.id)}/movimentar`, {
        method: 'POST',
        body: tipo === 'saida' ? { tipo, quantidade, motivo: $('#mov-motivo').value } : { tipo, quantidade },
      });
      state.origemFoco = null;
      fecharModal();
      avisar(res.mensagem, res.item.status === 'CRITICO' ? 'erro' : 'ok');
      await carregarEstoque({ focarItemId: item.id });
    } catch (erro) {
      if (erro.status === 401) return;
      definirFeedback(erro.message, 'erro');
      botao.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Aba Resumo
  // ------------------------------------------------------------------
  async function carregarResumo() {
    const alvo = $('#conteudo-resumo');
    estadoCarregando(alvo);
    try {
      renderizarResumo(await api('/api/resumo'));
    } catch (erro) {
      if (erro.status !== 401) estadoErro(alvo, erro, carregarResumo);
    }
  }

  function kpi(nomeIcone, valor, rotulo, classe = '') {
    return h(
      'div',
      { class: `card kpi ${classe}` },
      icone(nomeIcone),
      h('p', { class: 'kpi-value', text: valor }),
      h('p', { class: 'kpi-label', text: rotulo })
    );
  }

  function linhaTurno(rotulo, { total, aplicados }) {
    const pct = total ? Math.round((aplicados / total) * 100) : 0;
    const preenchimento = h('div', { class: 'progress-fill' });
    preenchimento.style.width = `${pct}%`;
    const id = `resumo-turno-${rotulo.toLowerCase()}`;
    return h(
      'div',
      { class: 'turno-row' },
      h(
        'p',
        { class: 'turno-row-head', id },
        h('span', { text: `Turno da ${rotulo}` }),
        h('span', { text: `${aplicados} de ${total}` })
      ),
      h(
        'div',
        {
          class: 'progress-track',
          role: 'progressbar',
          'aria-labelledby': id,
          'aria-valuemin': '0',
          'aria-valuemax': String(total),
          'aria-valuenow': String(aplicados),
        },
        preenchimento
      )
    );
  }

  function renderizarResumo(r) {
    const { institucional: inst, medicacoes: med, estoque: est } = r;
    const criticos = est.totalCriticos;

    const registros = r.ultimosRegistros.length
      ? h(
          'ul',
          { class: 'log-list' },
          r.ultimosRegistros.map((reg) =>
            h(
              'li',
              null,
              icone(reg.tipo === 'MEDICACAO' ? 'check-circle' : 'box'),
              h(
                'div',
                null,
                h('p', { text: reg.descricao }),
                h('p', { class: 'log-when', text: `às ${reg.horario} por ${reg.usuario}` })
              )
            )
          )
        )
      : h('p', { class: 'empty', text: 'Nenhum registro nesta sessão ainda.' });

    $('#conteudo-resumo').replaceChildren(
      h(
        'div',
        { class: 'kpi-grid' },
        kpi('paw', String(inst.animaisAbrigados), `Animais abrigados (${inst.caes} cães, ${inst.gatos} gatos)`),
        kpi(
          'check-circle',
          `${med.aplicadasDia}/${med.totalDia}`,
          'Medicações aplicadas hoje',
          med.aplicadasDia === med.totalDia ? 'is-ok' : ''
        ),
        kpi(
          criticos ? 'alert' : 'check-circle',
          String(criticos),
          criticos ? `${plural(criticos, 'Item crítico', 'Itens críticos')} no estoque` : 'Itens críticos — estoque OK',
          criticos ? 'is-critical' : 'is-ok'
        ),
        kpi('heart', String(inst.adocoesMes), 'Adoções no mês'),
        kpi('paw', String(inst.castracoesMes), 'Castrações no mês'),
        kpi('users', String(inst.voluntariosAtivos), 'Voluntários ativos')
      ),
      h('h2', { class: 'section-title', text: 'Medicações por turno' }),
      h('div', { class: 'card' }, linhaTurno('Manhã', med.manha), linhaTurno('Tarde', med.tarde)),
      h('h2', { class: 'section-title', text: 'Últimos registros' }),
      h('div', { class: 'card' }, registros),
      h('p', { class: 'disclaimer', text: 'Indicadores institucionais fictícios, para fins de demonstração do MVP.' })
    );
  }

  // ------------------------------------------------------------------
  // Inicialização
  // ------------------------------------------------------------------
  function registrarEventos() {
    $('#form-login').addEventListener('submit', aoEnviarLogin);
    $('#btn-toggle-senha').addEventListener('click', () =>
      definirVisibilidadeSenha($('#login-senha').type === 'password')
    );
    $('#btn-demo').addEventListener('click', () => {
      $('#login-email').value = DEMO.email;
      $('#login-senha').value = DEMO.senha;
      limparErroLogin();
      $('#btn-entrar').focus();
    });
    for (const campo of [$('#login-email'), $('#login-senha')]) {
      campo.addEventListener('input', () => campo.removeAttribute('aria-invalid'));
    }

    $('#btn-sair').addEventListener('click', sair);

    for (const btn of $$('.nav-btn')) btn.addEventListener('click', () => mostrarView(btn.dataset.view));
    for (const btn of $$('.segmented-btn')) btn.addEventListener('click', () => selecionarTurno(btn.dataset.turno));
    for (const p of $$('.pill')) p.addEventListener('click', () => selecionarCategoria(p.dataset.categoria));

    const modal = $('#modal-movimento');
    $('#form-movimento').addEventListener('submit', aoEnviarMovimento);
    $('#mov-quantidade').addEventListener('input', () => validarQuantidade());
    $('#btn-cancelar-mov').addEventListener('click', fecharModal);
    $('#btn-fechar-modal').addEventListener('click', fecharModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) fecharModal(); // toque fora do conteúdo
    });
    modal.addEventListener('close', () => {
      if (state.origemFoco && document.contains(state.origemFoco)) state.origemFoco.focus();
      state.origemFoco = null;
    });

    const modalCorr = $('#modal-correcao');
    const fecharCorrecao = () => modalCorr.open && modalCorr.close();
    $('#form-correcao').addEventListener('submit', aoEnviarCorrecao);
    $('#corr-justificativa').addEventListener('input', validarJustificativa);
    $('#btn-cancelar-correcao').addEventListener('click', fecharCorrecao);
    $('#btn-fechar-correcao').addEventListener('click', fecharCorrecao);
    modalCorr.addEventListener('click', (e) => {
      if (e.target === modalCorr) fecharCorrecao();
    });
    modalCorr.addEventListener('close', () => {
      if (state.origemFoco && document.contains(state.origemFoco)) state.origemFoco.focus();
      state.origemFoco = null;
      state.correcao = null;
    });

    window.addEventListener('resize', atualizarAlturaCabecalho);
  }

  async function iniciar() {
    registrarEventos();
    for (const btn of $$('.segmented-btn')) btn.setAttribute('aria-pressed', String(btn.dataset.turno === state.turno));
    for (const p of $$('.pill')) p.setAttribute('aria-pressed', String(p.dataset.categoria === state.categoria));

    const salva = lerSessao();
    if (salva && salva.token) {
      state.token = salva.token;
      try {
        const { usuario } = await api('/api/me');
        state.usuario = usuario;
        entrarNoApp();
        return;
      } catch {
        state.token = null;
        limparSessao();
      }
    }
    mostrarView('login', { focar: false });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* PWA é melhoria progressiva: o app funciona sem SW */
      });
    });
  }

  iniciar();
})();
