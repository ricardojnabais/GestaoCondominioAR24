/**
 * Página: Orçamento Anual · Admin
 *
 * - Mostra orçamento ativo do ano (rascunho ou aprovado)
 * - Em rascunho: tudo editável (receitas, despesas por rúbrica, fundo de reserva)
 * - Em aprovado: read-only com botão "Editar como nova versão"
 * - Resumo no topo com totais e resultado esperado
 * - Histórico de versões expandível
 */

import * as orcamento from '../../modules/orcamento.js';
import * as rubricas from '../../modules/rubricas.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let state = { ano: new Date().getFullYear().toString(), orcamento: null };
let containerRef = null;

export async function render(container) {
  containerRef = container;

  container.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="brand" id="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Gestão do Condomínio AR24</div>
            <div class="sub">Av. Amália Rodrigues · 24</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn-hamburger" id="hamburger"><span class="hl"></span><span class="hl"></span><span class="hl"></span></button>
        </div>
      </header>
      <main class="main">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Previsão Anual · Receitas e Despesas</div>
              <h1>Orçamento</h1>
            </div>
            <div style="margin-left:auto">
              <select id="f-ano" class="ano-select">
                <option value="2024" ${state.ano === '2024' ? 'selected' : ''}>2024</option>
                <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
                <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
                <option value="2027" ${state.ano === '2027' ? 'selected' : ''}>2027</option>
              </select>
            </div>
          </div>
        </div>

        <div id="orc-body"></div>
      </main>
    </div>
  `;

  await renderBody();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-ano').addEventListener('change', (e) => {
    state.ano = e.target.value;
    renderBody();
  });
}

async function renderBody() {
  const bodyEl = containerRef.querySelector('#orc-body');
  state.orcamento = await orcamento.obterAtivo(state.ano);
  const historico = await orcamento.historicoVersoes(state.ano);

  if (!state.orcamento) {
    bodyEl.innerHTML = `
      <div class="info-card" style="text-align:center;padding:40px 20px">
        <div style="font-size:36px;margin-bottom:12px">📋</div>
        <h3 style="margin:0 0 8px 0">Sem orçamento para ${state.ano}</h3>
        <p style="margin:0 0 16px 0;color:var(--text-muted);font-size:13px">
          Cria um rascunho para começar a planear receitas e despesas do ano.<br>
          ${parseInt(state.ano, 10) > 2024 ? 'Será pré-populado com base no ano anterior, se existir.' : ''}
        </p>
        <button class="btn primary" id="btn-criar">+ Criar Rascunho</button>
      </div>
    `;
    containerRef.querySelector('#btn-criar').addEventListener('click', async () => {
      try {
        const session = auth.getSession();
        await orcamento.criarRascunho(state.ano, session?.operatorName);
        renderBody();
      } catch (e) {
        alert(e.message);
      }
    });
    return;
  }

  const orc = state.orcamento;
  const totais = orcamento.calcularTotais(orc);
  const editable = orc.estado === 'rascunho';
  const rubsLista = await rubricas.listar();

  bodyEl.innerHTML = `
    ${renderEstadoBanner(orc, historico)}
    ${renderResumo(totais, editable, orc)}
    ${renderReceitas(orc, editable)}
    ${renderDespesas(orc, rubsLista, editable)}
    ${renderObservacoes(orc, editable)}
    ${renderActions(orc, editable)}
    ${historico.length > 1 ? renderHistorico(historico) : ''}
  `;

  bindEvents();
}

// ───────────────────────── BLOCOS DE RENDER ─────────────────────────

function renderEstadoBanner(orc, historico) {
  const stateClass = orc.estado === 'aprovado' ? 'banner-ok' : 'banner-amber';
  const stateLabel = orc.estado === 'aprovado'
    ? `Aprovado · v${orc.versao} · ${formatDateTime(orc.aprovadoEm)}${orc.aprovadoPor ? ' por ' + orc.aprovadoPor : ''}`
    : `Rascunho · v${orc.versao}`;
  return `
    <div class="orc-banner ${stateClass}">
      <strong>${stateLabel}</strong>
      ${historico.length > 1 ? `<span class="banner-meta">${historico.length} versões no histórico</span>` : ''}
    </div>
  `;
}

function renderResumo(t, editable, orc) {
  const resultadoCls = t.resultadoEsperado >= 0 ? 'resumo-positive' : 'resumo-negative';
  return `
    <div class="orc-resumo">
      <div class="resumo-line">
        <span class="rl-label">Saldo Inicial Transitado</span>
        ${editable
          ? `<input type="text" class="rl-input" id="r-saldo-inicial" value="${centavosToEur(t.saldoInicial)}">`
          : `<span class="rl-val">${formatMoney(t.saldoInicial)}</span>`}
      </div>
      <div class="resumo-line">
        <span class="rl-label">+ Receitas Previstas</span>
        <span class="rl-val positive">${formatMoney(t.receitasTotal)}</span>
      </div>
      <div class="resumo-line">
        <span class="rl-label">− Despesas Previstas</span>
        <span class="rl-val negative">${formatMoney(t.despesasTotal)}</span>
      </div>
      <div class="resumo-line">
        <span class="rl-label">− Fundo de Reserva</span>
        ${editable
          ? `<input type="text" class="rl-input" id="r-fundo" value="${centavosToEur(t.fundoReserva)}">`
          : `<span class="rl-val negative">${formatMoney(t.fundoReserva)}</span>`}
      </div>
      <div class="resumo-line resumo-total ${resultadoCls}">
        <span class="rl-label">= Resultado Esperado</span>
        <span class="rl-val">${formatMoney(t.resultadoEsperado)}</span>
      </div>
    </div>
  `;
}

function renderReceitas(orc, editable) {
  return `
    <div class="orc-section">
      <h3>Receitas Previstas</h3>
      <div id="receitas-list">
        ${(orc.receitasPrevistas || []).map(r => `
          <div class="rec-row" data-id="${r.id}">
            ${editable
              ? `<input type="text" class="rec-desc" placeholder="Descrição" value="${escapeAttr(r.descricao)}">`
              : `<span class="rec-desc-ro">${escapeHtml(r.descricao)}</span>`}
            ${editable
              ? `<input type="text" class="rec-val" placeholder="0,00" value="${centavosToEur(r.valor_centimos)}">`
              : `<span class="rec-val-ro">${formatMoney(r.valor_centimos)}</span>`}
            ${editable ? `<button class="btn-icon-mini" data-action="rec-del" title="Remover">✕</button>` : ''}
          </div>
        `).join('')}
      </div>
      ${editable ? `<button class="btn ghost" id="btn-rec-add">+ Adicionar Receita</button>` : ''}
    </div>
  `;
}

function renderDespesas(orc, rubsLista, editable) {
  const ativas = rubsLista.filter(r => !r.terminadaEm);
  const terminadas = rubsLista.filter(r => r.terminadaEm);
  const valores = orc.despesasPrevistasPorRubrica || {};

  return `
    <div class="orc-section">
      <h3>Despesas Previstas por Rúbrica</h3>
      <div class="desp-grid">
        ${ativas.map(r => renderDespRow(r, valores[r.id] || 0, editable, false)).join('')}
        ${terminadas.filter(r => valores[r.id])
          .map(r => renderDespRow(r, valores[r.id], editable, true)).join('')}
      </div>
      ${ativas.length === 0 ? `<p style="color:var(--text-muted);font-size:12.5px">Sem rúbricas ativas. Cria rúbricas em <em>Definições → Rúbricas</em>.</p>` : ''}
    </div>
  `;
}

function renderDespRow(rubrica, valor_centimos, editable, terminada) {
  return `
    <div class="desp-row${terminada ? ' rub-terminada' : ''}" data-rub-id="${rubrica.id}">
      <span class="dr-name">${escapeHtml(rubrica.nome)}${terminada ? ' <em style="font-size:10px">(terminada)</em>' : ''}</span>
      ${editable
        ? `<input type="text" class="dr-val" data-rub-id="${rubrica.id}" placeholder="0,00" value="${centavosToEur(valor_centimos)}">`
        : `<span class="dr-val-ro">${formatMoney(valor_centimos)}</span>`}
    </div>
  `;
}

function renderObservacoes(orc, editable) {
  return `
    <div class="orc-section">
      <h3>Observações</h3>
      ${editable
        ? `<textarea id="r-obs" rows="3" placeholder="Notas, justificações para a assembleia, decisões aprovadas...">${escapeHtml(orc.observacoes || '')}</textarea>`
        : `<div class="obs-ro">${orc.observacoes ? escapeHtml(orc.observacoes) : '<em style="color:var(--text-muted)">Sem observações</em>'}</div>`}
    </div>
  `;
}

function renderActions(orc, editable) {
  if (editable) {
    return `
      <div class="orc-actions">
        <button class="btn ghost" id="btn-descartar">Descartar Rascunho</button>
        <button class="btn" id="btn-guardar">Gravar Rascunho</button>
        <button class="btn primary" id="btn-aprovar">Aprovar Orçamento</button>
      </div>
    `;
  }
  return `
    <div class="orc-actions">
      <button class="btn primary" id="btn-rever">Editar como Nova Versão</button>
    </div>
  `;
}

function renderHistorico(historico) {
  return `
    <details class="orc-historico">
      <summary><strong>Histórico</strong> · ${historico.length} versões</summary>
      <div class="hist-list">
        ${historico.map(h => `
          <div class="hist-row hist-${h.estado}">
            <span class="hr-versao">v${h.versao}</span>
            <span class="hr-estado">${h.estado}</span>
            <span class="hr-data">${h.aprovadoEm ? `Aprovado ${formatDateTime(h.aprovadoEm)}` : `Criado ${formatDateTime(h.criadoEm)}`}</span>
            <span class="hr-por">${h.aprovadoPor || h.criadoPor || ''}</span>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

// ───────────────────────── EVENTOS ─────────────────────────

function bindEvents() {
  const orc = state.orcamento;
  const editable = orc.estado === 'rascunho';

  if (editable) {
    // Adicionar receita
    const btnRecAdd = containerRef.querySelector('#btn-rec-add');
    if (btnRecAdd) btnRecAdd.addEventListener('click', addReceita);

    // Remover receita
    containerRef.querySelectorAll('[data-action="rec-del"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.rec-row');
        const id = row.dataset.id;
        if (confirm('Remover esta linha de receita?')) removeReceita(id);
      });
    });

    // Botões principais
    containerRef.querySelector('#btn-descartar').addEventListener('click', descartar);
    containerRef.querySelector('#btn-guardar').addEventListener('click', () => guardar(true));
    containerRef.querySelector('#btn-aprovar').addEventListener('click', aprovar);
  } else {
    containerRef.querySelector('#btn-rever').addEventListener('click', rever);
  }
}

async function addReceita() {
  await guardar(false);  // grava o que está antes
  const orc = state.orcamento;
  orc.receitasPrevistas = orc.receitasPrevistas || [];
  orc.receitasPrevistas.push({ id: localUid(), descricao: '', valor_centimos: 0 });
  await orcamento.atualizar(orc.id, { receitasPrevistas: orc.receitasPrevistas });
  renderBody();
}

async function removeReceita(id) {
  const orc = state.orcamento;
  orc.receitasPrevistas = (orc.receitasPrevistas || []).filter(r => r.id !== id);
  await orcamento.atualizar(orc.id, { receitasPrevistas: orc.receitasPrevistas });
  renderBody();
}

/**
 * Lê o que está nos inputs e grava no orçamento.
 * @param {boolean} feedback - true mostra mensagem de sucesso
 */
async function guardar(feedback) {
  const orc = state.orcamento;
  const updates = colherInputs(orc);
  try {
    await orcamento.atualizar(orc.id, updates);
    if (feedback) {
      const btn = containerRef.querySelector('#btn-guardar');
      const original = btn.textContent;
      btn.textContent = '✓ Guardado';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
    state.orcamento = await orcamento.obterAtivo(state.ano);
  } catch (e) {
    alert('Erro a guardar: ' + e.message);
  }
}

function colherInputs(orc) {
  const updates = {};

  const elSaldo = containerRef.querySelector('#r-saldo-inicial');
  if (elSaldo) updates.saldoInicial_centimos = eurToCentavos(elSaldo.value);

  const elFundo = containerRef.querySelector('#r-fundo');
  if (elFundo) updates.fundoReserva_centimos = eurToCentavos(elFundo.value);

  const elObs = containerRef.querySelector('#r-obs');
  if (elObs) updates.observacoes = elObs.value.trim();

  // Receitas
  const receitasNovas = [];
  containerRef.querySelectorAll('.rec-row').forEach(row => {
    const id = row.dataset.id;
    const desc = row.querySelector('.rec-desc')?.value.trim() || '';
    const val = eurToCentavos(row.querySelector('.rec-val')?.value);
    receitasNovas.push({ id, descricao: desc, valor_centimos: val });
  });
  updates.receitasPrevistas = receitasNovas;

  // Despesas por rúbrica
  const desp = {};
  containerRef.querySelectorAll('.dr-val').forEach(inp => {
    const rubId = inp.dataset.rubId;
    const val = eurToCentavos(inp.value);
    if (val > 0) desp[rubId] = val;
  });
  updates.despesasPrevistasPorRubrica = desp;

  return updates;
}

async function aprovar() {
  if (!confirm('Aprovar este orçamento? Após aprovado, edições futuras criam uma nova versão (a atual fica arquivada).')) return;
  try {
    await guardar(false);
    const session = auth.getSession();
    await orcamento.aprovar(state.orcamento.id, session?.operatorName);
    renderBody();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function rever() {
  if (!confirm('Editar o orçamento aprovado? Será criada uma nova versão em rascunho. A atual fica arquivada (mantida no histórico).')) return;
  try {
    const session = auth.getSession();
    await orcamento.editarComoNovaVersao(state.ano, session?.operatorName);
    renderBody();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function descartar() {
  if (!confirm('Descartar este rascunho? Esta ação é definitiva.')) return;
  try {
    await orcamento.descartarRascunho(state.orcamento.id);
    state.orcamento = null;
    renderBody();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

// ───────────────────────── HELPERS ─────────────────────────

function centavosToEur(c) {
  if (!c) return '0,00';
  return (c / 100).toFixed(2).replace('.', ',');
}

function eurToCentavos(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function localUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
