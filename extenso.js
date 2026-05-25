/**
 * Modal: Nova Comunicação (perspetiva Admin).
 *
 * Admin envia:
 *   - Institucional · para TODOS os condóminos
 *   - Individual · para 1 condómino específico
 */

import * as comunicacoes from '../modules/comunicacoes.js';
import * as store from '../store/local-store.js';
import * as auth from '../auth/local-auth.js';

let modalEl = null;
let onSuccessCallback = null;

export async function open(opts = {}) {
  onSuccessCallback = opts.onSuccess || null;

  const tenants = await store.listDocs('tenants');
  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  const tenantOpts = tenants.map(t =>
    `<option value="${t.id}">${t.fraction} · ${t.name}</option>`
  ).join('');

  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-head">
        <h2>Nova Comunicação</h2>
        <button class="modal-close" id="nca-close">×</button>
      </div>

      <div class="modal-body">
        <div class="field">
          <label>Tipo</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="tipo" value="institucional" checked>
              <div class="radio-content">
                <div class="radio-title">📢 Institucional</div>
                <div class="radio-sub">Enviar para TODOS os condóminos<br>(convocatórias, obras, comunicados gerais)</div>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="tipo" value="individual">
              <div class="radio-content">
                <div class="radio-title">✉️ Individual</div>
                <div class="radio-sub">Enviar para 1 condómino específico<br>(quotas em atraso, ocorrências particulares)</div>
              </div>
            </label>
          </div>
        </div>

        <div class="field" id="nca-tenant-wrap" style="display:none">
          <label>Destinatário</label>
          <select id="nca-tenant">
            <option value="">— Escolher —</option>
            ${tenantOpts}
          </select>
        </div>

        <div class="field">
          <label>Assunto</label>
          <input type="text" id="nca-assunto" placeholder="ex: Convocatória Assembleia Geral · 15 Junho" maxlength="120">
        </div>

        <div class="field">
          <label>Mensagem</label>
          <textarea id="nca-mensagem" rows="6" placeholder="Escreve a mensagem..."></textarea>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn ghost" id="nca-cancel">Cancelar</button>
        <button class="btn primary" id="nca-submit" disabled>Enviar</button>
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
  modalEl.querySelector('#nca-close').addEventListener('click', close);
  modalEl.querySelector('#nca-cancel').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });

  const tenantWrap = modalEl.querySelector('#nca-tenant-wrap');
  modalEl.querySelectorAll('input[name="tipo"]').forEach(r => {
    r.addEventListener('change', (e) => {
      tenantWrap.style.display = e.target.value === 'individual' ? 'block' : 'none';
      checkSubmit();
    });
  });

  const checkSubmit = () => {
    const tipo = modalEl.querySelector('input[name="tipo"]:checked').value;
    const assunto = modalEl.querySelector('#nca-assunto').value.trim();
    const msg = modalEl.querySelector('#nca-mensagem').value.trim();
    const tenant = modalEl.querySelector('#nca-tenant').value;
    const tenantOk = tipo === 'institucional' || !!tenant;
    modalEl.querySelector('#nca-submit').disabled = !(assunto && msg && tenantOk);
  };
  modalEl.querySelector('#nca-assunto').addEventListener('input', checkSubmit);
  modalEl.querySelector('#nca-mensagem').addEventListener('input', checkSubmit);
  modalEl.querySelector('#nca-tenant').addEventListener('change', checkSubmit);

  modalEl.querySelector('#nca-submit').addEventListener('click', submit);
}

async function submit() {
  const tipo = modalEl.querySelector('input[name="tipo"]:checked').value;
  const assunto = modalEl.querySelector('#nca-assunto').value.trim();
  const mensagem = modalEl.querySelector('#nca-mensagem').value.trim();
  const tenantId = modalEl.querySelector('#nca-tenant').value;

  try {
    const session = auth.getSession();
    const data = { tipo, assunto, mensagem };
    if (tipo === 'individual') data.tenantId = tenantId;

    const c = await comunicacoes.criarPorAdmin(data, session?.operatorName || 'Administração');
    close();

    if (tipo === 'institucional') {
      alert(`Comunicado enviado a TODOS os condóminos.\n\n(Nota: cada condómino verá a mensagem na próxima vez que abrir a app. Email automático será implementado na migração para Firebase.)`);
    } else {
      const tenant = await store.getDoc('tenants', tenantId);
      alert(`Mensagem enviada a ${tenant?.name || 'destinatário'}.\n\n(Nota: o condómino verá a mensagem na próxima vez que abrir a app.)`);
    }

    if (onSuccessCallback) onSuccessCallback(c);
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
