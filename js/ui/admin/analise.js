/**
 * Página: Análise · Admin
 * Dashboard com KPIs, gráficos, top atrasos, estado dos planos.
 * Botão de export Excel anual.
 */

import * as analise from '../../modules/analise.js';
import * as exportExcel from '../../modules/export-excel.js';
import * as router from '../router.js';
import * as charts from '../charts.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let state = { ano: new Date().getFullYear().toString() };
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
      <main class="main main-wide">
        <div class="page-header">
          <div class="page-title">
            <button class="btn-home-circle" id="back-home">${icon('ic-home', 'btn-home-icon')}</button>
            <div>
              <div class="breadcrumb">Visão Consolidada · ${state.ano}</div>
              <h1>Análise</h1>
            </div>
            <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
              <select id="f-ano" class="ano-select">
                <option value="2024" ${state.ano === '2024' ? 'selected' : ''}>2024</option>
                <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
                <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
              </select>
              <button class="btn primary" id="btn-excel">📊 Exportar Excel</button>
            </div>
          </div>
        </div>

        <div id="dashboard"></div>
      </main>
    </div>
  `;

  await renderDashboard();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-ano').addEventListener('change', (e) => {
    state.ano = e.target.value;
    renderDashboard();
  });
  container.querySelector('#btn-excel').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-excel');
    btn.disabled = true;
    btn.textContent = 'A gerar...';
    try {
      const filename = await exportExcel.exportarAno(state.ano);
      btn.textContent = '✓ Descarregado';
      setTimeout(() => {
        btn.textContent = '📊 Exportar Excel';
        btn.disabled = false;
      }, 2000);
    } catch (e) {
      alert('Erro a gerar Excel: ' + e.message);
      btn.textContent = '📊 Exportar Excel';
      btn.disabled = false;
    }
  });
}

async function renderDashboard() {
  const dashEl = containerRef.querySelector('#dashboard');
  dashEl.innerHTML = `<div class="placeholder"><p>A calcular indicadores...</p></div>`;

  const [kpis, mensais, despRubricas, evolSaldo, atrasos, planos] = await Promise.all([
    analise.kpisYTD(state.ano),
    analise.movimentosMensais(state.ano),
    analise.despesasPorRubrica(state.ano),
    analise.evolucaoSaldo(state.ano),
    analise.topAtrasos(state.ano, 5),
    analise.estadoPlanos()
  ]);

  // KPIs principais
  const kpisHtml = `
    <div class="kpi-grid">
      <div class="kpi-card kpi-primary">
        <div class="kpi-lbl">Saldo Bancário</div>
        <div class="kpi-val">${formatMoney(kpis.saldoBancarioAtual_centimos)}</div>
        <div class="kpi-sub">Atual</div>
      </div>
      <div class="kpi-card ${kpis.taxaCobrancaYTD >= 90 ? 'kpi-green' : (kpis.taxaCobrancaYTD >= 70 ? 'kpi-amber' : 'kpi-red')}">
        <div class="kpi-lbl">Taxa de Cobrança</div>
        <div class="kpi-val">${kpis.taxaCobrancaYTD}%</div>
        <div class="kpi-sub">${formatMoney(kpis.recebidoYTD_centimos)} de ${formatMoney(kpis.esperadoYTD_centimos)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Despesas YTD</div>
        <div class="kpi-val">${formatMoney(kpis.despesasYTD_centimos)}</div>
        <div class="kpi-sub">no ano ${state.ano}</div>
      </div>
      <div class="kpi-card ${kpis.condominosEmAtraso > 0 ? 'kpi-red' : 'kpi-green'}">
        <div class="kpi-lbl">Em Atraso</div>
        <div class="kpi-val">${kpis.condominosEmAtraso} <span class="kpi-of">/ ${kpis.totalCondominos}</span></div>
        <div class="kpi-sub">${formatMoney(kpis.totalEmAtraso_centimos)} em falta</div>
      </div>
    </div>
  `;

  // Gráfico receitas vs despesas
  const grRecDespHtml = `
    <div class="dashboard-section">
      <h3>Receitas vs Despesas · Mensal</h3>
      ${charts.barChartReceitasDespesas(mensais)}
    </div>
  `;

  // Donut despesas por rúbrica + Top atrasos lado a lado
  const grRubricasHtml = `
    <div class="dashboard-section">
      <h3>Despesas por Rúbrica</h3>
      ${charts.donutChartRubricas(despRubricas)}
    </div>
  `;

  const atrasosHtml = `
    <div class="dashboard-section">
      <h3>Top Condóminos em Atraso</h3>
      ${atrasos.length === 0
        ? `<div class="empty-state">✓ Sem condóminos em atraso no ano ${state.ano}.</div>`
        : `<div class="atrasos-list">${atrasos.map(buildAtrasoRow).join('')}</div>`}
    </div>
  `;

  // Linha · evolução do saldo
  const grSaldoHtml = `
    <div class="dashboard-section">
      <h3>Evolução do Saldo Bancário</h3>
      ${charts.lineChartSaldo(evolSaldo)}
    </div>
  `;

  // Planos ativos
  const planosHtml = planos.length === 0 ? '' : `
    <div class="dashboard-section">
      <h3>Planos de Pagamento Ativos</h3>
      <div class="planos-mini">
        ${planos.map(({ plano, progresso }) => `
          <div class="plano-mini">
            <div class="pm-head">
              <strong>${plano.nome}</strong>
              <span>${progresso.percentagem}%</span>
            </div>
            <div class="pp-bar"><div class="pp-bar-fill" style="width:${progresso.percentagem}%"></div></div>
            <div class="pm-stats">
              ${progresso.pagas} / ${progresso.total} prestações ·
              ${formatMoney(progresso.valorPago_centimos)} de ${formatMoney(progresso.valorTotalEsperado_centimos)}
              ${progresso.emAtraso > 0 ? ` · <strong style="color:var(--red)">⚠ ${progresso.emAtraso} em atraso</strong>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  dashEl.innerHTML = `
    ${kpisHtml}
    ${grRecDespHtml}
    <div class="dashboard-grid-2">
      ${grRubricasHtml}
      ${atrasosHtml}
    </div>
    ${grSaldoHtml}
    ${planosHtml}
  `;
}

function buildAtrasoRow(a) {
  const pct = a.esperadoYTD_centimos > 0
    ? Math.round(a.pagoYTD_centimos / a.esperadoYTD_centimos * 100)
    : 0;
  return `
    <div class="atraso-row">
      <div class="ar-info">
        <div class="ar-name">${a.fraction} · ${a.tenantName}</div>
        <div class="ar-bar">
          <div class="ar-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="ar-stats">Pago ${formatMoney(a.pagoYTD_centimos)} de ${formatMoney(a.esperadoYTD_centimos)} (${pct}%)</div>
      </div>
      <div class="ar-falta">−${formatMoney(a.emFalta_centimos)}</div>
    </div>
  `;
}
