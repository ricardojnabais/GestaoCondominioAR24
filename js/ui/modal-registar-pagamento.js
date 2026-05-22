/**
 * Modal: Registar Pagamento (de Quota).
 *
 * Permite ao admin registar um pagamento de quota dum condómino.
 * Suporta:
 *   - Mês único (pagamento mensal normal)
 *   - Múltiplos meses (pagamento semestral, anual, regularização de atrasos)
 *
 * Mostra em tempo real:
 *   - Quotas esperadas para os meses selecionados
 *   - Diferença entre valor inserido e valor esperado
 *   - Aviso se houver discrepância
 */

import * as store from '../store/local-store.js';
import * as receipts from '../modules/receipts.js';
import { todayISO, formatMoney, parseMoney, formatMonth, monthsOfYear } from '../utils/format.js';

let modalEl = null;
let tenants = [];
let onSuccessCallback = null;

/**
 * Abre o modal.
 * @param {Object} [opts]
 * @param {string} [opts.tenantId] - pré-selecionar condómino
 * @param {string} [opts.mesRef] - pré-selecionar mês (YYYY-MM)
 * @param {Function} [opts.onSuccess] - callback após gravar
 */
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
  refreshComputation();
}

export function close() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
  document.body.style.overflow = '';
}

// ─── HTML ─────────────────────────────────────────────────

function buildHTML(opts) {
  const today = todayISO();
  const year = today.split('-')[0];
  const months = monthsOfYear(year);
  const currentMonth = today.slice(0, 7);

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

        <!-- Painel de distribuição automática -->
        <div id="rp-distribuicao" class="distribuicao-panel" style="display:none">
          <div class="dp-title">Distribuição</div>
          <div id="rp-distribuicao-rows"></div>
          <div class="dp-totals">
            <div><span>Esperado</span> <strong id="rp-esperado">0,00 €</strong></div>
            <div><span>Inserido</span> <strong id="rp-inserido">0,00 €</strong></div>
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

// ─── Events ──────────────────────────────────────────────

function bindEvents() {
  modalEl.querySelector('#rp-close').addEventListener('click', close);
  modalEl.querySelector('#rp-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) close();
  });

  modalEl.querySelector('#rp-tenant').addEventListener('change', async () => {
    await refreshChipsState();
    refreshComputation();
  });

  modalEl.querySelectorAll('.chip-month').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('disabled')) return;  // não selecionar pagos
      chip.classList.toggle('selected');
      refreshComputation();
    });
  });

  modalEl.querySelector('#rp-valor').addEventListener('input', refreshComputation);

  modalEl.querySelector('#rp-submit').addEventListener('click', submit);
}

// ─── Estado dos chips (pagos / parciais / livres) ────────

/**
 * Atualiza o estado visual dos chips de meses consoante o que já está pago
 * pelo condómino selecionado.
 *
 * - Pago integralmente: chip a cinzento, não-selecionável, com tooltip
 * - Pago parcialmente: chip com indicador (ainda selecionável para completar)
 * - Não pago: chip normal, selecionável
 */
async function refreshChipsState() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const chips = modalEl.querySelectorAll('.chip-month');

  // Sem condómino selecionado: limpar estado
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
      // Pago integralmente — bloquear
      chip.classList.add('disabled');
      chip.classList.remove('selected');  // se estava selecionado, limpar
      chip.title = `Já pago: ${formatMoney(pago)}`;
    } else if (pago > 0) {
      // Pago parcialmente — alertar mas permitir
      chip.classList.add('partial');
      chip.title = `Pago parcial: ${formatMoney(pago)} de ${formatMoney(quotaMensal)} esperado`;
    } else {
      chip.removeAttribute('title');
    }
  }
}

// ─── Cálculos em tempo real ──────────────────────────────

function getSelectedMonths() {
  return Array.from(modalEl.querySelectorAll('.chip-month.selected'))
    .map(c => c.dataset.month)
    .sort();
}

async function refreshComputation() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const selected = getSelectedMonths();
  const valorStr = modalEl.querySelector('#rp-valor').value;
  const valor = parseMoney(valorStr) || 0;

  const panel = modalEl.querySelector('#rp-distribuicao');
  const submit = modalEl.querySelector('#rp-submit');

  // Validações
  if (!tenantId || selected.length === 0) {
    panel.style.display = 'none';
    submit.disabled = true;
    return;
  }

  const tenant = tenants.find(t => t.id === tenantId);
  const ano = selected[0].split('-')[0];
  const quotaMensal = tenant?.rentByYear?.[ano] || 0;
  const esperado = quotaMensal * selected.length;

  // Construir linhas de distribuição
  const rowsHtml = selected.map(m =>
    `<div class="dp-row">
      <span>${formatMonth(m)}</span>
      <strong>${formatMoney(quotaMensal)}</strong>
    </div>`
  ).join('');

  modalEl.querySelector('#rp-distribuicao-rows').innerHTML = rowsHtml;
  modalEl.querySelector('#rp-esperado').textContent = formatMoney(esperado);
  modalEl.querySelector('#rp-inserido').textContent = formatMoney(valor);

  const diff = valor - esperado;
  const diffEl = modalEl.querySelector('#rp-diff');
  diffEl.textContent = formatMoney(diff);
  diffEl.className = diff === 0 ? 'ok' : (diff > 0 ? 'pos' : 'neg');

  // Aviso quando há discrepância
  const aviso = modalEl.querySelector('#rp-aviso');
  if (valor > 0 && diff !== 0) {
    aviso.style.display = 'block';
    aviso.className = 'dp-aviso warn';
    if (diff > 0) {
      aviso.innerHTML = `⚠ Valor inserido é <strong>${formatMoney(diff)}</strong> superior ao esperado. Confirma com o condómino antes de emitir.`;
    } else {
      aviso.innerHTML = `⚠ Valor em falta: <strong>${formatMoney(-diff)}</strong>. Recibo só será emitido pelo valor recebido.`;
    }
  } else if (valor > 0 && diff === 0) {
    aviso.style.display = 'block';
    aviso.className = 'dp-aviso ok';
    aviso.innerHTML = `✓ Valor confere com o esperado para ${selected.length} ${selected.length === 1 ? 'mês' : 'meses'}.`;
  } else {
    aviso.style.display = 'none';
  }

  panel.style.display = 'block';

  // Habilitar submit
  submit.disabled = !(tenantId && selected.length > 0 && valor > 0);
}

// ─── Submit ──────────────────────────────────────────────

async function submit() {
  const tenantId = modalEl.querySelector('#rp-tenant').value;
  const data = modalEl.querySelector('#rp-data').value;
  const tipo = modalEl.querySelector('#rp-tipo').value;
  const selected = getSelectedMonths();
  const valor = parseMoney(modalEl.querySelector('#rp-valor').value);
  const descricao = modalEl.querySelector('#rp-descricao').value.trim();

  try {
    const recibo = await receipts.emitir({
      tenantId,
      tipo,
      data,
      mesReferencia: selected,
      valor_centimos: valor,
      descricao: descricao || undefined
    });

    close();
    alert(`Recibo ${recibo.recibo_numero} emitido com sucesso.\nValor: ${formatMoney(recibo.valor_centimos)}.`);
    if (onSuccessCallback) onSuccessCallback(recibo);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
