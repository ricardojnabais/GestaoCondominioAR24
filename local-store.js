/**
 * Modal: Outros Recebimentos.
 *
 * Para receitas pontuais não relacionadas com quotas:
 *   - Devoluções de fornecedores
 *   - Reembolsos de seguros
 *   - Juros bancários
 *   - Donativos pontuais
 */

import * as store from '../store/local-store.js';
import * as outros from '../modules/outros-recebimentos.js';
import * as auth from '../auth/local-auth.js';
import { todayISO, formatMoney, parseMoney } from '../utils/format.js';

let modalEl = null;
let onSuccessCallback = null;

export async function open(opts = {}) {
  onSuccessCallback = opts.onSuccess || null;
  const tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';

  const tenantOpts = tenants.map(t =>
    `<option value="${t.id}">${t.fraction} · ${t.name}</option>`
  ).join('');

  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Registar Outro Recebimento</h2>
        <button class="modal-close" id="nr-close">×</button>
      </div>
      <div class="modal-body">
        <p class="hint" style="margin-bottom:14px">
          Para devoluções, reembolsos, juros bancários ou recebimentos
          que não sejam quotas. Para registar uma quota, usa "Inserir Quota" no menu principal.
        </p>

        <div class="field-row">
          <div class="field">
            <label>Data</label>
            <input type="date" id="nr-data" value="${todayISO()}">
          </div>
          <div class="field">
            <label>Valor</label>
            <input type="text" id="nr-valor" placeholder="0,00" inputmode="decimal">
          </div>
        </div>

        <div class="field">
          <label>Descrição</label>
          <input type="text" id="nr-descricao" placeholder="ex: Reembolso seguro, juros conta poupança...">
        </div>

        <div class="field">
          <label>Origem (opcional)</label>
          <input type="text" id="nr-origem" placeholder="Quem pagou?">
        </div>

        <div class="field">
          <label>Associado a condómino (opcional)</label>
          <select id="nr-tenant">
            <option value="">— Nenhum —</option>
            ${tenantOpts}
          </select>
          <div class="hint">Só se este recebimento for diretamente atribuível a uma fração.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" id="nr-cancel">Cancelar</button>
        <button class="btn primary" id="nr-submit" disabled>Registar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';

  bindEvents();
}

export function close() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.body.style.overflow = '';
}

function bindEvents() {
  modalEl.querySelector('#nr-close').addEventListener('click', close);
  modalEl.querySelector('#nr-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const checkSubmit = () => {
    const valor = parseMoney(modalEl.querySelector('#nr-valor').value);
    const desc = modalEl.querySelector('#nr-descricao').value.trim();
    modalEl.querySelector('#nr-submit').disabled = !(valor > 0 && desc.length > 0);
  };
  modalEl.querySelector('#nr-valor').addEventListener('input', checkSubmit);
  modalEl.querySelector('#nr-descricao').addEventListener('input', checkSubmit);

  modalEl.querySelector('#nr-submit').addEventListener('click', async () => {
    const data = {
      data: modalEl.querySelector('#nr-data').value,
      valor_centimos: parseMoney(modalEl.querySelector('#nr-valor').value),
      descricao: modalEl.querySelector('#nr-descricao').value.trim(),
      origem: modalEl.querySelector('#nr-origem').value.trim(),
      tenantId: modalEl.querySelector('#nr-tenant').value || null
    };
    try {
      const session = auth.getSession();
      const r = await outros.registar(data, session?.operatorName);
      close();
      alert(`Recebimento registado · ${formatMoney(r.valor_centimos)}`);
      if (onSuccessCallback) onSuccessCallback(r);
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  });
}
