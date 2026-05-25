/**
 * Página: Importar Dados · Admin
 *
 * Carrega um snapshot JSON, valida estrutura, mostra preview,
 * e permite importar (substitui tudo o que está no localStorage).
 *
 * Há 2 fontes:
 *  (a) Ficheiro local (input file)
 *  (b) Snapshot pré-validado em data/seed-historico.json (botão "Carregar Histórico AR24")
 */

import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import { icon } from '../icons.js';

let containerRef = null;
let snapshotPendente = null;

export async function render(container) {
  containerRef = container;
  snapshotPendente = null;

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
              <div class="breadcrumb">Definições · Manutenção</div>
              <h1>Importar Dados</h1>
            </div>
          </div>
        </div>

        <div class="settings-card" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">⚠ Operação destrutiva</h3>
          <p style="margin:0;font-size:13px;color:var(--text)">
            Importar um snapshot substitui <strong>TODOS</strong> os dados atuais (recibos, despesas, planos, comunicações).
            Os dados do condomínio (nome, IBAN, etc.) também são substituídos.
            Faz <strong>Exportar Backup</strong> antes para garantires um ponto de retorno.
          </p>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn ghost" id="btn-export-backup">↓ Exportar Backup do estado atual</button>
          </div>
        </div>

        <div class="settings-card" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Opção A · Histórico AR24 pré-validado</h3>
          <p style="margin:0 0 10px 0;font-size:13px;color:var(--text-muted)">
            Carrega o histórico real do condomínio Av. Amália Rodrigues 24 (2021-2026): quotas, despesas, planos extraordinários e dados em atraso.
          </p>
          <button class="btn primary" id="btn-load-historico">Carregar Histórico AR24</button>
        </div>

        <div class="settings-card" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Opção B · Ficheiro local</h3>
          <p style="margin:0 0 10px 0;font-size:13px;color:var(--text-muted)">
            Aceita um JSON gerado por <code>Exportar Backup</code> ou outro snapshot compatível.
          </p>
          <input type="file" id="file-input" accept=".json,application/json" style="display:none">
          <button class="btn ghost" id="btn-pick-file">Escolher Ficheiro JSON…</button>
          <span id="file-name" style="margin-left:8px;font-size:12px;color:var(--text-muted)"></span>
        </div>

        <div id="preview-area"></div>

        <div id="msg-area"></div>
      </main>
    </div>
  `;

  containerRef.querySelector('#brand').addEventListener('click', () => router.navigate('admin/definicoes'));
  containerRef.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));

  containerRef.querySelector('#btn-export-backup').addEventListener('click', exportBackup);
  containerRef.querySelector('#btn-load-historico').addEventListener('click', carregarHistoricoAR24);
  containerRef.querySelector('#btn-pick-file').addEventListener('click', () => {
    containerRef.querySelector('#file-input').click();
  });
  containerRef.querySelector('#file-input').addEventListener('change', onFilePicked);
}

async function exportBackup() {
  try {
    const dump = store.exportAll();
    const json = JSON.stringify(dump, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-AR24-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMsg('✓ Backup exportado.', 'ok');
  } catch (e) {
    showMsg('Erro ao exportar: ' + e.message, 'error');
  }
}

async function carregarHistoricoAR24() {
  try {
    const res = await fetch('data/seed-historico.json');
    if (!res.ok) throw new Error('Não foi possível carregar o histórico');
    const json = await res.json();
    snapshotPendente = json;
    renderPreview(json, 'Histórico AR24 pré-validado');
  } catch (e) {
    showMsg('Erro: ' + e.message + '. Confirma que o ficheiro data/seed-historico.json está presente no servidor.', 'error');
  }
}

function onFilePicked(e) {
  const file = e.target.files[0];
  if (!file) return;
  containerRef.querySelector('#file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      snapshotPendente = json;
      renderPreview(json, file.name);
    } catch (err) {
      showMsg('JSON inválido: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function renderPreview(snapshot, fonteLabel) {
  const area = containerRef.querySelector('#preview-area');
  // Tentar 2 estruturas: snapshot estruturado OU dump bruto
  const isEstruturado = snapshot.tenants && Array.isArray(snapshot.tenants);
  let resumo;
  if (isEstruturado) {
    resumo = {
      tenants: (snapshot.tenants || []).length,
      rubricas: (snapshot.rubricas || []).length,
      recibos: (snapshot.receipts || []).length,
      despesas: (snapshot.pagamentosDespesa || []).length,
      planos: (snapshot.planos || []).length,
      prestacoes: (snapshot.prestacoes || []).length,
      orcamentos: (snapshot.orcamentos || []).length,
      outrosRecebimentos: (snapshot.outrosRecebimentos || []).length,
      comunicacoes: (snapshot.comunicacoes || []).length,
    };
  } else {
    // Dump bruto (formato exportAll)
    resumo = Object.fromEntries(
      Object.entries(snapshot).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])
    );
  }
  const info = snapshot.__importInfo
    ? `<p style="margin:0 0 10px 0;font-size:12px;color:var(--text-muted)">
         Gerado: ${snapshot.__importInfo.geradoEm || '—'} ·
         Período: ${snapshot.__importInfo.periodo || '—'}
       </p>`
    : '';

  area.innerHTML = `
    <div class="settings-card" style="border-color:var(--amber)">
      <h3 style="margin:0 0 6px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Pré-visualização · ${escapeHtml(fonteLabel)}</h3>
      ${info}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px">
        ${Object.entries(resumo).map(([k, v]) => `
          <div style="background:var(--blue-50);padding:8px 10px;border-radius:6px">
            <div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:600">${escapeHtml(k)}</div>
            <div style="font-size:18px;font-weight:700;color:var(--primary)">${v}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn ghost" id="btn-cancel">Cancelar</button>
        <button class="btn primary btn-danger" id="btn-confirm">⚠ Apagar Tudo e Importar</button>
      </div>
    </div>
  `;

  area.querySelector('#btn-cancel').addEventListener('click', () => {
    snapshotPendente = null;
    area.innerHTML = '';
  });
  area.querySelector('#btn-confirm').addEventListener('click', confirmarImportacao);
}

async function confirmarImportacao() {
  if (!snapshotPendente) return;
  if (!confirm('Última confirmação: vais APAGAR TUDO o que está atualmente na app e substituir pelo snapshot. Continuar?')) {
    return;
  }
  try {
    const isEstruturado = snapshotPendente.tenants && Array.isArray(snapshotPendente.tenants);
    if (isEstruturado) {
      const res = store.importarSnapshot(snapshotPendente);
      showMsg(`✓ Importação concluída. ${Object.entries(res.contagens).map(([k,v]) => `${k}: ${v}`).join(' · ')}`, 'ok');
    } else {
      store.importAll(snapshotPendente);
      showMsg('✓ Importação concluída.', 'ok');
    }
    setTimeout(() => {
      location.reload();
    }, 1500);
  } catch (e) {
    showMsg('Erro: ' + e.message, 'error');
  }
}

function showMsg(text, kind) {
  const el = containerRef.querySelector('#msg-area');
  el.innerHTML = `<div class="save-msg save-msg-${kind}" style="margin-top:12px;padding:10px 14px;border-radius:8px;font-size:13px">${escapeHtml(text)}</div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
