/**
 * Modal: Registar Pagamento (de Quota).
 *
 * Suporta:
 *   - Mês único (pagamento mensal normal)
 *   - Múltiplos meses (pagamento semestral, anual, regularização de atrasos)
 *   - Pagamento parcial (de mês parcialmente pago, completar valor em falta)
 *   - Pagamento em excesso (gera saldo a favor)
 *   - Usar saldo prévio (checkbox · acerta valor com balde do condómino)
 */

import * as store from '../store/local-store.js';
import * as receipts from '../modules/receipts.js';
import { todayISO, formatMoney, parseMoney, formatMonth, monthsOfYear } from '../utils/format.js';

let modalEl = null;
let tenants = [];
let onSuccessCallback = null;
let saldoTenantAtual = 0;  // cêntimos · saldo do condómino selecionado

export async function open(opts = {}) {
  tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  onSuccessCallback = opts.onSuccess || null;

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildHTML(opts);
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents();
  await refreshChipsState();
  await refreshSaldoCard();
  refreshComputation();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

function buildHTML(opts) {
  const today = todayISO();
  const year = today.split('-')[0];
  const months = monthsOfYear(year);

  const tenantOptions = tenants.map(t => {
    const selected = t.id === opts.tenantId ? 'selected' : '';
    return `<option value="${t.id}" ${selected}>${t.fraction} · ${t.name}</option>`;
  }).join('');

  const monthChips = months.map(m => {
    const isPre = opts.mesRef === m;
    return `<button type="button" class="chip-month ${isPre ? 'selected' : ''}" data-month="${m}">
      ${formatMonth(m, true).split(' ')[0]}
    </button>`;
  }).join('');

  return `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Registar Pagamento</h2>
        <button class="modal-close" id="rp-close">×</button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label>Condómino</label>
          <select id="rp-tenant">
            <option value="">— Escolher —</option>
            ${tenantOptions}
          </select>
        </div>

        <!-- Card saldo a favor (aparece quando condómino tem saldo > 0) -->
        <div id="rp-saldo-card" class="saldo-card" style="display:none">
          <div class="saldo-card-ic">€</div>
          <div class="saldo-card-info">
            <div class="saldo-card-lbl">Saldo a favor</div>
            <div class="saldo-card-val" id="rp-saldo-val">0,00 €</div>
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Data do Pagamento</label>
            <input type="date" id="rp-data" value="${today}">
          </div>
          <div class="field">
            <label>Tipo</label>
            <select id="rp-tipo">
              <option value="quota">Quota Mensal</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Mês(es) Abrangidos · Clica para selecionar</label>
          <div class="chips-grid" id="rp-meses">
            ${monthChips}
          </div>
          <div class="hint">Selecciona vários para pagamentos semestrais ou anuais</div>
        </div>

        <div class="field">
          <label>Valor Total Recebido</label>
          <input type="text" id="rp-valor" placeholder="0,00" inputmode="decimal">
        </div>

        <!-- Checkbox usar saldo (aparece quando há saldo e falta dinheiro) -->
        <div id="rp-usar-saldo-wrap" class="usar-saldo-wrap" style="display:none">
          <label class="checkbox-label">
            <input type="checkbox" id="rp-usar-saldo">
            <span>Usar saldo a favor (<strong id="rp-usar-saldo-val">0,00 €</strong>) para acertar</span>
          </label>
        </div>

        <!-- Painel de distribuição -->
        <div id="rp-distribuicao" class="distribuicao-panel" style="display:none">
          <div class="dp-title">Distribuição</div>
          <div id="rp-distribuicao-rows"></div>
          <div class="dp-totals">
            <div><span>Esperado</span> <strong id="rp-esperado">0,00 €</strong></div>
            <div><span>Inserido</span> <strong id="rp-inserido">0,00 €</strong></div>
            <div id="rp-saldo-aplicado-row" style="display:none">
              <span>+ Saldo aplicado</span> <strong id="rp-saldo-aplicado">0,00 €</strong>
            </div>
            <div class="dp-diff"><span>Diferença</span> <strong id="rp-diff">0,00 €</strong></div>
          </div>
          <div id="rp-aviso" class="dp-aviso" style="display:none"></div>
        </div>

        <div class="field">
          <label>Descrição (opcional)</label>
          <input type="text" id="rp-descricao" placeholder="(gerada automaticamente se vazio)">
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="rp-cancel">Cancelar</button>
        <button class="btn primary" id="rp-submit" disabled>Emitir Recibo</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  modalEl.querySelector('#rp-close').addEventListener('click', close);
  modalEl.querySelector('#rp-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  modalEl.querySelector('#rp-tenant').addEventListener('change', async () => {
    await refreshChipsState();
    await refreshSaldoCard();
    refreshComputation();
  });

  modalEl.querySelectorAll('.chip-month').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('disabled')) return;
      chip.classList.toggle('selected');
      refreshComputation();
    });
  });

  modalEl.querySelector('#rp-valor').addEventListener('input', refreshComputation);
  modalEl.querySelector('#rp-usar-saldo').addEventListener('change', refreshComputation);
  modalEl.querySelector('#rp-submit').addEventListener('click', submit);
}

async function refreshChipsState() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const chips = modalEl.querySelectorAll('.chip-month');

  if (!tenantId) {
    chips.forEach(c => {
      c.classList.remove('disabled', 'partial');
      c.removeAttribute('title');
    });
    return;
  }

  const tenant = tenants.find(t => t.id === tenantId);

  for (const chip of chips) {
    const month = chip.dataset.month;
    const ano = month.split('-')[0];
    const quotaMensal = tenant?.rentByYear?.[ano] || 0;
    const pago = await receipts.valorPagoNoMes(tenantId, month);

    chip.classList.remove('disabled', 'partial');

    if (pago > 0 && pago >= quotaMensal) {
      chip.classList.add('disabled');
      chip.classList.remove('selected');
      chip.title = `Já pago: ${formatMoney(pago)}`;
    } else if (pago > 0) {
      chip.classList.add('partial');
      chip.title = `Pago parcial: ${formatMoney(pago)} de ${formatMoney(quotaMensal)} esperado`;
    } else {
      chip.removeAttribute('title');
    }
  }
}

async function refreshSaldoCard() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const card = modalEl.querySelector('#rp-saldo-card');
  const usarWrap = modalEl.querySelector('#rp-usar-saldo-wrap');

  if (!tenantId) {
    saldoTenantAtual = 0;
    card.style.display = 'none';
    usarWrap.style.display = 'none';
    return;
  }

  saldoTenantAtual = await receipts.saldoCondomino(tenantId);

  if (saldoTenantAtual > 0) {
    modalEl.querySelector('#rp-saldo-val').textContent = formatMoney(saldoTenantAtual);
    modalEl.querySelector('#rp-usar-saldo-val').textContent = formatMoney(saldoTenantAtual);
    card.style.display = 'flex';
  } else {
    card.style.display = 'none';
    usarWrap.style.display = 'none';
  }
}

function getSelectedMonths() {
  return Array.from(modalEl.querySelectorAll('.chip-month.selected'))
    .map(c => c.dataset.month)
    .sort();
}

async function refreshComputation() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const selected = getSelectedMonths();
  const valor = parseMoney(modalEl.querySelector('#rp-valor').value) || 0;
  const usarSaldo = modalEl.querySelector('#rp-usar-saldo').checked;

  const panel = modalEl.querySelector('#rp-distribuicao');
  const submit = modalEl.querySelector('#rp-submit');
  const usarWrap = modalEl.querySelector('#rp-usar-saldo-wrap');

  if (!tenantId || selected.length === 0) {
    panel.style.display = 'none';
    submit.disabled = true;
    usarWrap.style.display = 'none';
    return;
  }

  const tenant = tenants.find(t => t.id === tenantId);
  const ano = selected[0].split('-')[0];
  const quotaMensal = tenant?.rentByYear?.[ano] || 0;

  // Esperado para CADA mês (descontando o que já foi pago)
  const rowsData = [];
  let esperado = 0;
  for (const m of selected) {
    const jaPago = await receipts.valorPagoNoMes(tenantId, m);
    const emFalta = Math.max(0, quotaMensal - jaPago);
    esperado += emFalta;
    rowsData.push({ mes: m, quotaMensal, jaPago, emFalta });
  }

  // Calcular saldoUsado (se aplicável)
  let saldoUsado = 0;
  let excesso = 0;
  let diff = valor - esperado;

  if (diff > 0) {
    // Pagou mais do que esperado · gera saldo a favor
    excesso = diff;
    saldoUsado = 0;
  } else if (diff < 0 && usarSaldo && saldoTenantAtual > 0) {
    // Pagou menos · usar do saldo para acertar (até ao que tem disponível)
    saldoUsado = Math.min(saldoTenantAtual, -diff);
    excesso = 0;
    diff = diff + saldoUsado;  // pode ainda ficar negativo se saldo insuficiente
  }

  // Mostrar/esconder o checkbox de usar saldo
  if (saldoTenantAtual > 0 && (valor < esperado)) {
    usarWrap.style.display = 'block';
  } else {
    usarWrap.style.display = 'none';
  }

  // Construir linhas de distribuição
  const rowsHtml = rowsData.map(r => {
    if (r.jaPago > 0) {
      return `
        <div class="dp-row dp-row-partial">
          <div class="dp-row-info">
            <div class="dp-month">${formatMonth(r.mes)} <span class="dp-tag">parcial</span></div>
            <div class="dp-detail">Já pago ${formatMoney(r.jaPago)} de ${formatMoney(r.quotaMensal)}</div>
          </div>
          <strong>${formatMoney(r.emFalta)}</strong>
        </div>
      `;
    }
    return `
      <div class="dp-row">
        <span>${formatMonth(r.mes)}</span>
        <strong>${formatMoney(r.quotaMensal)}</strong>
      </div>
    `;
  }).join('');

  modalEl.querySelector('#rp-distribuicao-rows').innerHTML = rowsHtml;
  modalEl.querySelector('#rp-esperado').textContent = formatMoney(esperado);
  modalEl.querySelector('#rp-inserido').textContent = formatMoney(valor);

  // Linha de saldo aplicado
  const saldoRow = modalEl.querySelector('#rp-saldo-aplicado-row');
  if (saldoUsado > 0) {
    saldoRow.style.display = 'flex';
    modalEl.querySelector('#rp-saldo-aplicado').textContent = formatMoney(saldoUsado);
  } else {
    saldoRow.style.display = 'none';
  }

  const diffEl = modalEl.querySelector('#rp-diff');
  diffEl.textContent = formatMoney(diff);
  diffEl.className = diff === 0 ? 'ok' : (diff > 0 ? 'pos' : 'neg');

  // Aviso
  const aviso = modalEl.querySelector('#rp-aviso');
  if (valor > 0) {
    aviso.style.display = 'block';
    if (diff === 0 && excesso === 0 && saldoUsado === 0) {
      aviso.className = 'dp-aviso ok';
      aviso.innerHTML = `✓ Valor confere com o esperado para ${selected.length} ${selected.length === 1 ? 'mês' : 'meses'}.`;
    } else if (diff === 0 && saldoUsado > 0) {
      aviso.className = 'dp-aviso ok';
      aviso.innerHTML = `✓ Acertado com ${formatMoney(saldoUsado)} de saldo. Saldo final: ${formatMoney(saldoTenantAtual - saldoUsado)}.`;
    } else if (excesso > 0) {
      aviso.className = 'dp-aviso warn';
      aviso.innerHTML = `⚠ Excesso de <strong>${formatMoney(excesso)}</strong> · ficará disponível como saldo a favor. Saldo final: <strong>${formatMoney(saldoTenantAtual + excesso)}</strong>.`;
    } else if (diff < 0) {
      aviso.className = 'dp-aviso warn';
      aviso.innerHTML = `⚠ Valor em falta: <strong>${formatMoney(-diff)}</strong>. Recibo será emitido pelo valor recebido (mês fica parcial).`;
    } else {
      aviso.style.display = 'none';
    }
  } else {
    aviso.style.display = 'none';
  }

  panel.style.display = 'block';
  submit.disabled = !(tenantId && selected.length > 0 && valor > 0);

  // Guardar valores computados no elemento para o submit
  modalEl.dataset.excesso = excesso;
  modalEl.dataset.saldoUsado = saldoUsado;
}

async function submit() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const data = modalEl.querySelector('#rp-data').value;
  const tipo = modalEl.querySelector('#rp-tipo').value;
  const selected = getSelectedMonths();
  const valor = parseMoney(modalEl.querySelector('#rp-valor').value);
  const descricao = modalEl.querySelector('#rp-descricao').value.trim();

  const excesso = parseInt(modalEl.dataset.excesso || '0', 10);
  const saldoUsado = parseInt(modalEl.dataset.saldoUsado || '0', 10);

  try {
    const recibo = await receipts.emitir({
      tenantId,
      tipo,
      data,
      mesReferencia: selected,
      valor_centimos: valor,
      excesso_centimos: excesso,
      saldoUsado_centimos: saldoUsado,
      descricao: descricao || undefined
    });

    close();
    let msg = `Recibo ${recibo.recibo_numero} emitido.\nValor recebido: ${formatMoney(recibo.valor_centimos)}.`;
    if (saldoUsado > 0) msg += `\nSaldo usado: ${formatMoney(saldoUsado)}.`;
    if (excesso > 0) msg += `\nExcesso (saldo a favor): ${formatMoney(excesso)}.`;
    alert(msg);
    if (onSuccessCallback) onSuccessCallback(recibo);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
