/**
 * Página: Banco · Admin
 *
 * Lista cronológica de TODOS os movimentos bancários do ano:
 *   - Recibos (entradas, exceto estornos que são saídas)
 *   - Outros recebimentos (entradas)
 *   - Pagamentos de despesa (saídas)
 *
 * Para cada linha calcula-se o saldo acumulado após o movimento.
 */

import * as store from '../../store/local-store.js';
import * as saldoBanco from '../../modules/saldo-banco.js';
import * as router from '../router.js';
import * as modalDR from '../modal-detalhe-recibo.js';
import { icon } from '../icons.js';
import { formatMoney, formatDate } from '../../utils/format.js';

let state = {
  ano: new Date().getFullYear().toString(),
  tipo: 'todos'  // 'todos' | 'entradas' | 'saidas'
};

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
              <div class="breadcrumb">Movimentos do Exercício</div>
              <h1>Situação Bancária</h1>
            </div>
          </div>
        </div>

        <div id="saldo-resumo"></div>

        <div class="filters">
          <div class="filter-group">
            <label>Ano</label>
            <select id="f-ano">
              <option value="2024" ${state.ano === '2024' ? 'selected' : ''}>2024</option>
              <option value="2025" ${state.ano === '2025' ? 'selected' : ''}>2025</option>
              <option value="2026" ${state.ano === '2026' ? 'selected' : ''}>2026</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Tipo</label>
            <select id="f-tipo">
              <option value="todos" ${state.tipo === 'todos' ? 'selected' : ''}>Todos</option>
              <option value="entradas" ${state.tipo === 'entradas' ? 'selected' : ''}>Só entradas</option>
              <option value="saidas" ${state.tipo === 'saidas' ? 'selected' : ''}>Só saídas</option>
            </select>
          </div>
        </div>

        <div id="banco-lista"></div>
      </main>
    </div>
  `;

  await renderAll();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-ano').addEventListener('change', (e) => { state.ano = e.target.value; renderAll(); });
  container.querySelector('#f-tipo').addEventListener('change', (e) => { state.tipo = e.target.value; renderAll(); });
}

async function renderAll() {
  const ano = state.ano;
  const { saldo, receitas, despesas, saldoInicial } = await saldoBanco.calcularSaldo(ano);

  // Resumo no topo
  containerRef.querySelector('#saldo-resumo').innerHTML = `
    <div class="bank-summary">
      <div class="bs-lbl">Saldo Bancário Actual</div>
      <div class="bs-value">${formatMoney(saldo)}</div>
      <div class="bs-formula">
        <span title="Saldo inicial">${formatMoney(saldoInicial)}</span>
        <span class="op">+</span>
        <span class="rec" title="Receitas">${formatMoney(receitas)}</span>
        <span class="op">−</span>
        <span class="desp" title="Despesas">${formatMoney(despesas)}</span>
      </div>
    </div>
  `;

  // Construir lista de movimentos
  const receipts = (await store.queryDocs('receipts', { ano })).map(r => ({
    id: r.id,
    data: r.data,
    descricao: r.descricao,
    detalhe: `${r.fraction || ''} · ${r.tenantName || ''} · RCB ${r.recibo_numero || ''}`,
    valor: r.valor_centimos,
    tipo: r.valor_centimos < 0 ? 'estorno' : 'recibo',
    sourceId: r.id,
    sourceCol: 'receipts',
    cancelado: r.cancelado
  }));

  const outros = (await store.queryDocs('outrosRecebimentos', { ano })).map(o => ({
    id: 'o-' + o.id,
    data: o.data,
    descricao: o.descricao,
    detalhe: 'Outro recebimento',
    valor: o.valor_centimos,
    tipo: 'outro',
    sourceId: o.id,
    sourceCol: 'outrosRecebimentos'
  }));

  const despesasList = (await store.queryDocs('pagamentosDespesa', { ano })).map(d => ({
    id: 'd-' + d.id,
    data: d.data,
    descricao: d.descricao,
    detalhe: d.fornecedor || 'Despesa',
    valor: -Math.abs(d.valor_centimos),
    tipo: 'despesa',
    sourceId: d.id,
    sourceCol: 'pagamentosDespesa'
  }));

  let movimentos = [...receipts, ...outros, ...despesasList];

  // Filtro por tipo
  if (state.tipo === 'entradas') movimentos = movimentos.filter(m => m.valor > 0);
  if (state.tipo === 'saidas') movimentos = movimentos.filter(m => m.valor < 0);

  // Ordenar por data crescente (para calcular saldo acumulado)
  movimentos.sort((a, b) =>
    (a.data || '').localeCompare(b.data || '') || (a.id || '').localeCompare(b.id || '')
  );

  // Calcular saldo acumulado linha a linha
  let acumulado = saldoInicial;
  movimentos.forEach(m => {
    if (m.cancelado) return;  // cancelados não contam para o saldo
    acumulado += m.valor;
    m.saldoApos = acumulado;
  });

  // Mostrar do mais recente para o mais antigo
  movimentos.reverse();

  if (movimentos.length === 0) {
    containerRef.querySelector('#banco-lista').innerHTML = `
      <div class="placeholder">
        <h3>Sem movimentos para estes filtros</h3>
      </div>
    `;
    return;
  }

  const rowsHtml = movimentos.map(m => buildRow(m)).join('');
  containerRef.querySelector('#banco-lista').innerHTML = `
    <div class="bank-totals">
      <div class="bt-item">
        <div class="bt-lbl">Saldo inicial</div>
        <div class="bt-val">${formatMoney(saldoInicial)}</div>
      </div>
      <div class="bt-item">
        <div class="bt-lbl">Entradas</div>
        <div class="bt-val pos">+${formatMoney(receitas)}</div>
      </div>
      <div class="bt-item">
        <div class="bt-lbl">Saídas</div>
        <div class="bt-val neg">−${formatMoney(despesas)}</div>
      </div>
      <div class="bt-item">
        <div class="bt-lbl">Saldo actual</div>
        <div class="bt-val"><strong>${formatMoney(saldo)}</strong></div>
      </div>
    </div>
    <div class="movements">${rowsHtml}</div>
  `;

  // Click em linha de recibo abre o detalhe
  containerRef.querySelectorAll('.mov[data-source-col="receipts"]').forEach(el => {
    el.addEventListener('click', () => modalDR.open(el.dataset.sourceId, { onUpdate: () => renderAll() }));
  });
}

function buildRow(m) {
  const isIn = m.valor > 0;
  const sign = isIn ? 'in' : 'out';
  const ic = isIn ? 'ic-quota-in' : 'ic-payment-out';
  const cls = m.cancelado ? 'mov cancelled' : 'mov';
  const interactive = m.sourceCol === 'receipts' ? 'cursor:pointer' : '';

  return `
    <div class="${cls}" data-source-id="${m.sourceId}" data-source-col="${m.sourceCol}" style="${interactive}">
      <div class="mov-ic ${sign}">${icon(ic, 'm-ic')}</div>
      <div class="mov-txt">
        <div class="mov-title">
          ${m.cancelado ? '<span class="badge-cancelled">CANC</span> ' : ''}
          ${m.descricao || m.detalhe}
        </div>
        <div class="mov-meta">${formatDate(m.data)} · ${m.detalhe}</div>
      </div>
      <div class="mov-right">
        <div class="mov-val ${isIn ? 'pos' : 'neg'}">${isIn ? '+' : ''}${formatMoney(m.valor)}</div>
        ${m.saldoApos !== undefined ? `<div class="mov-saldo">Saldo: ${formatMoney(m.saldoApos)}</div>` : ''}
      </div>
    </div>
  `;
}
