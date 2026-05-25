/**
 * Página: Em Aberto · Admin
 *
 * 3 secções:
 *  1. Quotas em falta (por condómino)
 *  2. Prestações pendentes (de planos ativos)
 *  3. Plano Schindler (despesas programadas vs pagas)
 */

import * as emAberto from '../../modules/em-aberto.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney, formatDate } from '../../utils/format.js';

let containerRef = null;
const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
              <div class="breadcrumb">Operações</div>
              <h1>Em Aberto</h1>
            </div>
          </div>
        </div>

        <div id="kpis-top"></div>
        <div id="sec-quotas"></div>
        <div id="sec-prestacoes"></div>
        <div id="sec-schindler"></div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));

  await renderAll();
}

async function renderAll() {
  const quotasFalta = await emAberto.quotasEmFaltaPorCondomino();
  const prestPendentes = await emAberto.prestacoesPendentes();
  const schindler = await emAberto.planoSchindler();

  // KPIs no topo
  const totalQuotas = quotasFalta.reduce((s, q) => s + q.totalEmFalta, 0);
  const totalPrest = prestPendentes.reduce((s, p) => s + p.totalPendente, 0);
  const totalReceber = totalQuotas + totalPrest;
  const totalSchindlerFalta = schindler ? schindler.totalEmFalta : 0;

  containerRef.querySelector('#kpis-top').innerHTML = `
    <div class="ea-kpis">
      <div class="ea-kpi ea-kpi-in">
        <div class="ea-kpi-lbl">A Receber · Total</div>
        <div class="ea-kpi-val">${formatMoney(totalReceber)}</div>
        <div class="ea-kpi-sub">${quotasFalta.length} condómino(s) em atraso · ${prestPendentes.length} planos</div>
      </div>
      <div class="ea-kpi ea-kpi-out">
        <div class="ea-kpi-lbl">A Pagar Schindler · Falta</div>
        <div class="ea-kpi-val">${formatMoney(totalSchindlerFalta)}</div>
        <div class="ea-kpi-sub">${schindler ? `${schindler.percentPago.toFixed(0)}% do plano executado` : 'Sem plano definido'}</div>
      </div>
    </div>
  `;

  // Secção 1: Quotas em falta
  renderQuotas(quotasFalta);

  // Secção 2: Prestações pendentes
  renderPrestacoes(prestPendentes);

  // Secção 3: Plano Schindler
  renderSchindler(schindler);
}

function renderQuotas(lista) {
  const el = containerRef.querySelector('#sec-quotas');
  if (lista.length === 0) {
    el.innerHTML = `
      <h2 class="ea-sec-title">Quotas em Falta</h2>
      <div class="placeholder"><p>✓ Não há quotas em atraso.</p></div>
    `;
    return;
  }

  el.innerHTML = `
    <h2 class="ea-sec-title">Quotas em Falta · ${lista.length} condómino(s)</h2>
    <div class="ea-cards">
      ${lista.map(q => `
        <div class="ea-card">
          <div class="ea-card-head">
            <div>
              <div class="ea-card-name">${escapeHtml(q.tenantName)}</div>
              <div class="ea-card-sub">${escapeHtml(q.fraction)}</div>
            </div>
            <div class="ea-card-total">
              <span class="ea-total-lbl">Em falta</span>
              <span class="ea-total-val">${formatMoney(q.totalEmFalta)}</span>
            </div>
          </div>
          <div class="ea-anos">
            ${Object.entries(q.anos).sort(([a],[b])=>b.localeCompare(a)).map(([ano, dados]) => `
              <div class="ea-ano-row">
                <div class="ea-ano-head">
                  <strong>${ano}</strong>
                  <span class="ea-ano-val">${formatMoney(dados.falta)}</span>
                </div>
                <div class="ea-meses">
                  ${dados.mesesFalta.map(m => `<span class="ea-mes-chip">${MES_ABREV[m-1]}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPrestacoes(lista) {
  const el = containerRef.querySelector('#sec-prestacoes');
  if (lista.length === 0) {
    el.innerHTML = `
      <h2 class="ea-sec-title">Prestações Pendentes</h2>
      <div class="placeholder"><p>✓ Não há prestações pendentes.</p></div>
    `;
    return;
  }

  el.innerHTML = `
    <h2 class="ea-sec-title">Prestações Pendentes · ${lista.length}</h2>
    <div class="ea-cards">
      ${lista.map(p => `
        <div class="ea-card">
          <div class="ea-card-head">
            <div>
              <div class="ea-card-name">${escapeHtml(p.plano.nome)}</div>
              <div class="ea-card-sub">${escapeHtml(p.tenantName)} · ${escapeHtml(p.fraction)}</div>
            </div>
            <div class="ea-card-total">
              <span class="ea-total-lbl">Falta</span>
              <span class="ea-total-val">${formatMoney(p.totalPendente)}</span>
            </div>
          </div>
          <div class="ea-prestacoes">
            ${p.prestacoes.sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||'')).map(pr => `
              <div class="ea-prest-row">
                <span class="ea-prest-num">#${pr.numero}</span>
                <span class="ea-prest-data">${formatDate(pr.dueDate)}</span>
                <span class="ea-prest-val">${formatMoney(pr.valor_centimos)}</span>
              </div>
            `).join('')}
          </div>
          <div class="ea-actions">
            <button class="btn ghost" data-plano="${p.plano.id}">Ver Plano Completo</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  el.querySelectorAll('[data-plano]').forEach(b => {
    b.addEventListener('click', () => {
      // Tenta navegar para detalhe do plano (rota pode ser admin/planos?id=)
      router.navigate('admin/planos');
    });
  });
}

function renderSchindler(s) {
  const el = containerRef.querySelector('#sec-schindler');
  if (!s) {
    el.innerHTML = `
      <h2 class="ea-sec-title">Plano Schindler</h2>
      <div class="placeholder"><p>Sem plano Schindler definido. Importa o histórico para o carregar.</p></div>
    `;
    return;
  }

  el.innerHTML = `
    <h2 class="ea-sec-title">Plano Pagamento Schindler</h2>
    <div class="settings-card">
      <p class="orc-help">${escapeHtml(s.plano.descricao)} · Fornecedor: <strong>${escapeHtml(s.plano.fornecedor)}</strong></p>

      <div class="schindler-progress">
        <div class="sp-bar"><div class="sp-fill" style="width:${Math.min(100, s.percentPago)}%"></div></div>
        <div class="sp-labels">
          <span><strong>${formatMoney(s.totalPago)}</strong> pago</span>
          <span><strong>${s.percentPago.toFixed(0)}%</strong> executado</span>
          <span><strong>${formatMoney(s.totalEmFalta)}</strong> em falta</span>
        </div>
      </div>

      <table class="tabela-schindler">
        <thead>
          <tr>
            <th>Data Prevista</th>
            <th>Descrição</th>
            <th class="ta-right">Valor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${s.prestacoesEnriquecidas.map(p => `
            <tr class="sch-row sch-row-${p.estado}">
              <td>${formatDate(p.data)}</td>
              <td>${escapeHtml(p.descricao)}</td>
              <td class="ta-right">${formatMoney(p.valor_centimos)}</td>
              <td>
                ${p.estado === 'paga' ? `<span class="cc-tag tag-green">✓ Paga</span>` :
                  p.estado === 'em_falta' ? `<span class="cc-tag tag-red">⚠ Em falta</span>` :
                  `<span class="cc-tag tag-muted">Futura</span>`}
              </td>
            </tr>
          `).join('')}
          <tr class="sch-row-total">
            <td colspan="2"><strong>TOTAL</strong></td>
            <td class="ta-right"><strong>${formatMoney(s.totalPrevisto)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      ${s.pagamentosReais.length > 0 ? `
        <details style="margin-top:14px">
          <summary style="cursor:pointer;font-size:12px;color:var(--primary);font-weight:600">▸ Pagamentos reais registados (${s.pagamentosReais.length})</summary>
          <table class="tabela-schindler" style="margin-top:8px">
            <thead><tr><th>Data Real</th><th>Descrição</th><th class="ta-right">Valor</th></tr></thead>
            <tbody>
              ${s.pagamentosReais.map(d => `
                <tr><td>${formatDate(d.date)}</td><td>${escapeHtml(d.descricao || '—')}</td><td class="ta-right">${formatMoney(d.valor_centimos)}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
