/**
 * Página: Definições do Condomínio · Admin
 * Editar dados que aparecem no cabeçalho dos recibos PDF.
 */

import * as condominioInfo from '../../modules/condominio-info.js';
import * as router from '../router.js';
import { icon } from '../icons.js';

let containerRef = null;

export async function render(container) {
  containerRef = container;
  const info = await condominioInfo.obter();

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
              <div class="breadcrumb">Dados do Condomínio</div>
              <h1>Definições</h1>
            </div>
          </div>
        </div>

        <div class="info-card" style="margin-bottom:18px">
          <p style="margin:0;font-size:13px;color:var(--text-muted)">
            Estes dados aparecem no cabeçalho de todos os recibos PDF gerados.
            Quaisquer alterações refletem-se em recibos futuros · os já emitidos
            mantêm os dados que tinham na altura da geração.
          </p>
        </div>

        <div class="settings-card">
          <div class="field">
            <label>Nome Oficial</label>
            <input type="text" id="s-nome" value="${escapeAttr(info.nome)}" maxlength="120">
          </div>

          <div class="field">
            <label>Morada</label>
            <input type="text" id="s-morada" value="${escapeAttr(info.morada)}" maxlength="120">
          </div>

          <div class="field-row">
            <div class="field">
              <label>Código Postal</label>
              <input type="text" id="s-cp" value="${escapeAttr(info.codigoPostal)}" maxlength="10" placeholder="1234-567">
            </div>
            <div class="field">
              <label>Localidade</label>
              <input type="text" id="s-loc" value="${escapeAttr(info.localidade)}" maxlength="50">
            </div>
          </div>

          <div class="field">
            <label>NIF</label>
            <input type="text" id="s-nif" value="${escapeAttr(info.nif)}" maxlength="9" placeholder="9 dígitos">
          </div>

          <div class="field">
            <label>Email (opcional)</label>
            <input type="email" id="s-email" value="${escapeAttr(info.email)}" maxlength="80">
          </div>

          <div class="field">
            <label>IBAN (opcional)</label>
            <input type="text" id="s-iban" value="${escapeAttr(info.iban)}" maxlength="34" placeholder="PT50...">
          </div>

          <div class="field">
            <label>Telefone (opcional)</label>
            <input type="text" id="s-tel" value="${escapeAttr(info.telefone)}" maxlength="20">
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
            <button class="btn ghost" id="btn-reset">Repor</button>
            <button class="btn primary" id="btn-save">Guardar</button>
          </div>

          <div id="save-msg"></div>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));

  container.querySelector('#btn-save').addEventListener('click', save);
  container.querySelector('#btn-reset').addEventListener('click', () => {
    if (confirm('Repor para os valores actualmente guardados (perde alterações por gravar)?')) {
      render(containerRef);
    }
  });
}

async function save() {
  const updates = {
    nome: containerRef.querySelector('#s-nome').value.trim(),
    morada: containerRef.querySelector('#s-morada').value.trim(),
    codigoPostal: containerRef.querySelector('#s-cp').value.trim(),
    localidade: containerRef.querySelector('#s-loc').value.trim(),
    nif: containerRef.querySelector('#s-nif').value.trim(),
    email: containerRef.querySelector('#s-email').value.trim(),
    iban: containerRef.querySelector('#s-iban').value.trim(),
    telefone: containerRef.querySelector('#s-tel').value.trim()
  };

  if (!updates.nome || !updates.morada || !updates.nif) {
    showMsg('Nome, morada e NIF são obrigatórios.', 'error');
    return;
  }

  if (!/^\d{9}$/.test(updates.nif)) {
    showMsg('NIF inválido (deve ter 9 dígitos).', 'error');
    return;
  }

  try {
    await condominioInfo.atualizar(updates);
    showMsg('✓ Definições guardadas.', 'ok');
  } catch (e) {
    showMsg('Erro: ' + e.message, 'error');
  }
}

function showMsg(text, kind) {
  const el = containerRef.querySelector('#save-msg');
  el.className = `save-msg save-msg-${kind}`;
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3500);
}

function escapeAttr(s) {
  return (s || '').replace(/"/g, '&quot;');
}
