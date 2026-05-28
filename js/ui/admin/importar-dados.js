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

        <div class="settings-card" style="margin-top:24px;border-color:var(--gold,#d4af37)">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--primary)">Migração · Cloud Firestore</h3>
          <p style="margin:0 0 12px 0;font-size:13px;color:var(--text)">
            Migra os dados do localStorage deste device para o Firestore na cloud. Após a migração, todos os devices ficam sincronizados em tempo real.
          </p>
          <div id="migrar-estado" style="font-size:12px;color:var(--text-muted);margin-bottom:10px"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn ghost" id="btn-backup-local">📥 Backup do localStorage</button>
            <button class="btn primary" id="btn-migrar">☁ Migrar para Firestore</button>
            <button class="btn ghost" id="btn-voltar-local" style="display:none">⟲ Voltar a localStorage</button>
          </div>
          <div id="migrar-log" style="margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:11px;background:#f9f6ee;border:1px solid #e8dfc8;border-radius:8px;padding:10px;max-height:280px;overflow:auto;display:none;white-space:pre-wrap"></div>
        </div>
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

  // Migração Firestore
  containerRef.querySelector('#btn-backup-local').addEventListener('click', backupOnlyClick);
  containerRef.querySelector('#btn-migrar').addEventListener('click', migrarClick);
  containerRef.querySelector('#btn-voltar-local').addEventListener('click', voltarLocalClick);
  await actualizarEstadoMigracao();
}

async function actualizarEstadoMigracao() {
  const elEstado = containerRef.querySelector('#migrar-estado');
  const btnMigrar = containerRef.querySelector('#btn-migrar');
  const btnVoltar = containerRef.querySelector('#btn-voltar-local');
  if (!elEstado) return;

  const backend = localStorage.getItem('ar24_storage_backend') || 'local';
  const firebaseOk = !!window.__firebase?.db;

  let msg = '';
  if (backend === 'firestore') {
    msg = '☁ Backend ativo: <strong>Firestore (cloud)</strong>. Pode voltar a localStorage abaixo.';
    btnMigrar.style.display = 'none';
    btnVoltar.style.display = '';
  } else if (!firebaseOk) {
    msg = '⚠ Firebase não está inicializado. Preenche <code>firebase-config.js</code> antes de migrar.';
    btnMigrar.disabled = true;
  } else {
    msg = `🗄 Backend ativo: <strong>localStorage</strong>. Migração disponível.`;
  }
  elEstado.innerHTML = msg;
}

async function backupOnlyClick() {
  try {
    const { backupLocal } = await import('../../modules/migrar-firestore.js');
    const meta = await backupLocal();
    logMigracao(`✓ Backup descarregado · ${Object.values(meta.coleccoes).reduce((s,n)=>s+n,0)} docs totais`);
  } catch (e) {
    logMigracao(`✗ Erro: ${e.message}`);
  }
}

async function migrarClick() {
  if (!confirm('Iniciar migração para Firestore?\n\n1. Será criado um backup automático em JSON descarregado.\n2. Todos os dados do localStorage serão escritos no Firestore.\n3. O backend muda para Firestore e a app recarrega.\n\nContinuar?')) return;

  const log = containerRef.querySelector('#migrar-log');
  log.style.display = '';
  log.textContent = '';

  const btnMigrar = containerRef.querySelector('#btn-migrar');
  btnMigrar.disabled = true;
  btnMigrar.textContent = 'A migrar…';

  try {
    const { migrar, activarBackendFirestore } = await import('../../modules/migrar-firestore.js');
    const resultado = await migrar((p) => {
      logMigracao(`[${p.etapa}] ${p.msg}`);
    });

    logMigracao('');
    logMigracao('─── Resultado ───');
    logMigracao(`Backup: ${resultado.backupMeta.dataExport}`);
    logMigracao(`Total escritos: ${resultado.totalEscritos}`);
    logMigracao('');
    logMigracao('Coleção · Local · Firestore');
    for (const [col, n] of Object.entries(resultado.contagemLocal)) {
      const f = resultado.contagemFirestore[col];
      const ok = n === f ? '✓' : (f === -1 ? '⚠' : '✗');
      logMigracao(`  ${ok} ${col.padEnd(22)} ${String(n).padStart(4)} → ${String(f).padStart(4)}`);
    }

    if (!resultado.ok) {
      logMigracao('');
      logMigracao(`⚠ ${resultado.inconsistencias.length} inconsistências encontradas. Verifica a tabela.`);
      logMigracao('Recomendação: NÃO mudar de backend ainda. Investigar as colecções acima.');
      btnMigrar.disabled = false;
      btnMigrar.textContent = '☁ Migrar para Firestore';
      return;
    }

    logMigracao('');
    logMigracao('✓ Migração validada. A activar Firestore como backend em 3s…');
    setTimeout(activarBackendFirestore, 3000);
  } catch (e) {
    logMigracao(`✗ ERRO: ${e.message}`);
    console.error('Migração:', e);
    btnMigrar.disabled = false;
    btnMigrar.textContent = '☁ Migrar para Firestore';
  }
}

async function voltarLocalClick() {
  if (!confirm('Voltar a usar localStorage?\n\nOs dados em Firestore não são apagados. O backend volta a ler apenas do localStorage do device.\n\nNota: os dados no localStorage podem estar desatualizados se foram escritos em Firestore por outros devices.\n\nContinuar?')) return;
  const { voltarBackendLocal } = await import('../../modules/migrar-firestore.js');
  voltarBackendLocal();
}

function logMigracao(linha) {
  const log = containerRef.querySelector('#migrar-log');
  if (!log) return;
  log.textContent += (log.textContent ? '\n' : '') + linha;
  log.scrollTop = log.scrollHeight;
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
