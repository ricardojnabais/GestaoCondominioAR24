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
import * as auditoria from '../../modules/auditoria-recibos.js';

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

        <div class="settings-card" style="margin-top:24px;border-color:#2d8659">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#2d8659">Auditoria · Exportação Anual</h3>
          <p style="margin:0 0 12px 0;font-size:13px;color:var(--text)">
            Exporta os recibos do ano selecionado em formato de auditoria (Excel com 4 folhas: Recibos · Resumo Mensal · Por Condómino · Condóminos).
            Disponível a partir de <strong>2026</strong> (anos anteriores são histórico não auditável pelo sistema).
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <label style="font-size:13px;color:var(--text)">Ano:</label>
            <select id="audit-ano" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px"></select>
            <button class="btn primary" id="btn-export-auditoria">📊 Exportar Excel Auditoria</button>
          </div>
          <div id="aud-export-log" style="margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#2d8659;display:none"></div>
        </div>

        <div class="settings-card" style="margin-top:18px;border-color:#d4af37">
          <h3 style="margin:0 0 8px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#b8941f">Alinhamento Canónico · Recibos 2026</h3>
          <p style="margin:0 0 12px 0;font-size:13px;color:var(--text)">
            Substitui os recibos de 2026 em Firestore pelos <strong>64 recibos canónicos</strong> do dataset oficial
            (inclui o nº 27 ao Município da Amadora · Reabilita+). Operação destrutiva mas idempotente.
            Recibos de outros anos <strong>não são tocados</strong>.
          </p>
          <div id="aud-estado" style="font-size:12px;color:var(--text-muted);margin-bottom:10px">A verificar estado…</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn ghost" id="btn-comparar-audit">🔍 Comparar com dataset</button>
            <button class="btn danger" id="btn-alinhar-audit">⚠ Alinhar recibos 2026 com dataset</button>
          </div>
          <div id="aud-log" style="margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:11px;background:#f9f6ee;border:1px solid #e8dfc8;border-radius:8px;padding:10px;max-height:280px;overflow:auto;display:none;white-space:pre-wrap"></div>
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

  // Auditoria · selector de ano (anos com recibos, >= 2026)
  await popularAnosAuditoria();
  containerRef.querySelector('#btn-export-auditoria').addEventListener('click', exportAuditoriaClick);
  containerRef.querySelector('#btn-comparar-audit').addEventListener('click', compararAuditoriaClick);
  containerRef.querySelector('#btn-alinhar-audit').addEventListener('click', alinharAuditoriaClick);

  await actualizarEstadoMigracao();
  await actualizarEstadoAuditoria();
}

async function popularAnosAuditoria() {
  const sel = containerRef.querySelector('#audit-ano');
  if (!sel) return;
  // Buscar anos com recibos · só >= 2026 (anos anteriores são históricos não auditáveis)
  const recibos = await store.listDocs('receipts');
  const anos = [...new Set(recibos.map(r => r.ano).filter(a => typeof a === 'number' && a >= 2026))].sort((a, b) => b - a);
  // Garantir que o ano atual está sempre presente
  const anoAtual = new Date().getFullYear();
  if (anoAtual >= 2026 && !anos.includes(anoAtual)) anos.unshift(anoAtual);
  if (anos.length === 0) anos.push(2026);
  sel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
}

// ─────────────── AUDITORIA ───────────────

function logAud(text) {
  const el = containerRef.querySelector('#aud-log');
  el.style.display = '';
  el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

async function actualizarEstadoAuditoria() {
  const el = containerRef.querySelector('#aud-estado');
  if (!el) return;
  try {
    const r = await auditoria.compararComDataset();
    let msg = `📋 Dataset canónico: ${r.totalCanonico} recibos · Atualmente em Firestore: ${r.totalAtual}`;
    if (r.totalAtual === r.totalCanonico && r.divergem === 0 && r.apenasAtual === 0) {
      msg = `✓ ${msg} · alinhado`;
      el.style.color = '#2d8659';
    } else {
      const detalhes = [];
      if (r.apenasAtual > 0) detalhes.push(`${r.apenasAtual} extra atual`);
      if (r.apenasDataset > 0) detalhes.push(`${r.apenasDataset} em falta`);
      if (r.divergem > 0) detalhes.push(`${r.divergem} divergem`);
      msg = `⚠ ${msg} · ${detalhes.join(', ')}`;
      el.style.color = '#c0392b';
    }
    el.innerHTML = msg;
  } catch (e) {
    el.textContent = '⚠ Erro: ' + e.message;
    el.style.color = '#c0392b';
  }
}

async function exportAuditoriaClick() {
  const btn = containerRef.querySelector('#btn-export-auditoria');
  const sel = containerRef.querySelector('#audit-ano');
  const ano = parseInt(sel.value, 10);
  const logEl = containerRef.querySelector('#aud-export-log');
  btn.disabled = true; btn.textContent = 'A gerar…';
  logEl.style.display = '';
  logEl.textContent = `A exportar recibos de ${ano}…`;
  try {
    const filename = await auditoria.exportarAuditoria(ano);
    logEl.textContent = `✓ Exportado: ${filename}`;
  } catch (e) {
    logEl.style.color = '#c0392b';
    logEl.textContent = `✗ ${e.message}`;
    alert('Erro a exportar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '📊 Exportar Excel Auditoria';
  }
}

async function compararAuditoriaClick() {
  const btn = containerRef.querySelector('#btn-comparar-audit');
  btn.disabled = true; btn.textContent = 'A comparar…';
  try {
    const r = await auditoria.compararComDataset();
    logAud(`── Comparação ──`);
    logAud(`Dataset canónico: ${r.totalCanonico} recibos`);
    logAud(`Atual em Firestore: ${r.totalAtual} recibos`);
    logAud(`Iguais: ${r.iguais}`);
    logAud(`Divergem: ${r.divergem}`);
    logAud(`Só no atual (extra): ${r.apenasAtual}`);
    logAud(`Só no canónico (em falta): ${r.apenasDataset}`);
    if (r.divergem > 0) {
      logAud(`\nDivergências (primeiras ${r.divergemDetalhe.length}):`);
      for (const d of r.divergemDetalhe) {
        logAud(`  ${d.recibo}: ${JSON.stringify(d.diffs)}`);
      }
    }
    if (r.totalAtual === r.totalCanonico && r.divergem === 0 && r.apenasAtual === 0) {
      logAud('\n✓ ESTADO ALINHADO · não é preciso fazer nada');
    } else {
      logAud('\n⚠ DESALINHADO · usa "Alinhar recibos 2026 com dataset" para corrigir');
    }
    await actualizarEstadoAuditoria();
  } catch (e) {
    logAud(`✗ Erro: ${e.message}`);
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Comparar com dataset';
  }
}

async function alinharAuditoriaClick() {
  const r1 = await auditoria.compararComDataset();
  const aviso = `⚠ ALINHAMENTO DESTRUTIVO\n\n` +
    `Dataset canónico: ${r1.totalCanonico} recibos\n` +
    `Atualmente em Firestore: ${r1.totalAtual} recibos\n\n` +
    `O sistema vai:\n` +
    `  • Apagar ${r1.apenasAtual} recibo(s) que não estão no dataset\n` +
    `  • Sobrescrever ${r1.totalCanonico} com a versão canónica\n` +
    `  • Manter os recibos de anos anteriores intactos\n\n` +
    `IRREVERSÍVEL. Faz backup antes se quiseres ponto de retorno.\n\n` +
    `Continuar?`;
  if (!confirm(aviso)) return;
  if (!confirm('Confirmas? Esta operação NÃO pode ser desfeita.')) return;

  const btn = containerRef.querySelector('#btn-alinhar-audit');
  btn.disabled = true; btn.textContent = 'A alinhar…';
  const logEl = containerRef.querySelector('#aud-log');
  logEl.style.display = '';
  logEl.textContent = '── Alinhamento ──\n';

  try {
    const stats = await auditoria.alinharRecibos2026((p) => {
      if (p.stage === 'loading') logAud(p.detail);
      else if (p.stage === 'reading') logAud(p.detail);
      else if (p.stage === 'cleaning') logEl.textContent = logEl.textContent.replace(/\nApagados: \d+.*\n?$/, '') + `\nApagados: ${p.current}/${p.total} · ${p.detail || ''}`;
      else if (p.stage === 'writing') logEl.textContent = logEl.textContent.replace(/\nEscritos: \d+.*\n?$/, '') + `\nEscritos: ${p.current}/${p.total} · ${p.detail || ''}`;
      else if (p.stage === 'done') logAud('\n' + p.detail);
    });
    logAud(`\n── Resultado ──`);
    logAud(`Lidos do dataset: ${stats.lidos}`);
    logAud(`Apagados (extra): ${stats.apagados}`);
    logAud(`Escritos: ${stats.escritos}`);
    if (stats.erros.length > 0) {
      logAud(`\n⚠ Erros: ${stats.erros.length}`);
      for (const e of stats.erros.slice(0, 10)) logAud(`  ${e}`);
    } else {
      logAud('\n✓ ALINHAMENTO COMPLETO · sem erros');
    }
    await actualizarEstadoAuditoria();
  } catch (e) {
    logAud(`\n✗ FALHA: ${e.message}`);
    alert('Alinhamento falhou: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '⚠ Alinhar recibos 2026 com dataset';
  }
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
