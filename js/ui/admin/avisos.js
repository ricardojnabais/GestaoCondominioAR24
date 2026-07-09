/**
 * Página: Avisos de Atraso · Admin
 * Dois separadores:
 *  - "Enviar avisos": lista de atrasos com seleção múltipla + envio.
 *  - "Histórico": registos de envio (prova) agrupados por mês.
 */

import * as avisos from '../../modules/avisos-atraso.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

let containerRef = null;
let selecionados = new Set();
let abaAtiva = 'enviar';

export async function render(container) {
  containerRef = container;
  selecionados = new Set();
  abaAtiva = 'enviar';

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
              <div class="breadcrumb">Cobrança</div>
              <h1>Avisos de Atraso</h1>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin:4px 0 16px;border-bottom:2px solid #eee">
          <button class="av-aba" data-aba="enviar" style="background:none;border:none;padding:10px 16px;font-size:15px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px">Enviar avisos</button>
          <button class="av-aba" data-aba="historico" style="background:none;border:none;padding:10px 16px;font-size:15px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px">Histórico</button>
        </div>

        <div id="avisos-conteudo"><div style="padding:20px;color:#888">A carregar…</div></div>
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));

  container.querySelectorAll('.av-aba').forEach(b => {
    b.addEventListener('click', () => { abaAtiva = b.dataset.aba; pintarAbas(); renderAba(); });
  });

  pintarAbas();
  await renderAba();
}

function pintarAbas() {
  containerRef.querySelectorAll('.av-aba').forEach(b => {
    const ativo = b.dataset.aba === abaAtiva;
    b.style.color = ativo ? '#1E54C7' : '#888';
    b.style.borderBottomColor = ativo ? '#1E54C7' : 'transparent';
  });
}

async function renderAba() {
  if (abaAtiva === 'historico') return renderHistorico();
  return renderEnviar();
}

async function renderEnviar() {
  const el = containerRef.querySelector('#avisos-conteudo');
  const [lista, jaAvisados] = await Promise.all([
    avisos.listarParaAviso(),
    avisos.jaAvisadosEsteMes(),
  ]);

  if (lista.length === 0) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#2f7d4f;font-weight:600">✓ Nenhum condómino com quotas em atraso. Nada a enviar.</div>`;
    return;
  }

  const elegiveis = lista.filter(x => x.temEmail && !jaAvisados.has(x.tenantId));
  const idsElegiveis = new Set(elegiveis.map(x => x.tenantId));
  selecionados.forEach(id => { if (!idsElegiveis.has(id)) selecionados.delete(id); });
  const todosSel = elegiveis.length > 0 && elegiveis.every(x => selecionados.has(x.tenantId));

  const linhas = lista.map(x => {
    const avisado = jaAvisados.has(x.tenantId);
    const elegivel = x.temEmail && !avisado;
    const sel = selecionados.has(x.tenantId);
    let badge = '';
    if (!x.temEmail) badge = '<span style="font-size:11px;background:#fbe6e2;color:#b3402f;padding:2px 8px;border-radius:10px;margin-left:6px">sem email</span>';
    else if (avisado) badge = '<span style="font-size:11px;background:#e3f0e7;color:#2f7d4f;padding:2px 8px;border-radius:10px;margin-left:6px">já avisado</span>';
    const check = elegivel
      ? `<div style="width:22px;height:22px;border-radius:6px;border:2px solid ${sel ? '#1E54C7' : '#cbd5e1'};background:${sel ? '#1E54C7' : '#fff'};display:flex;align-items:center;justify-content:center;flex-shrink:0">${sel ? '<span style="color:#fff;font-size:14px;line-height:1">✓</span>' : ''}</div>`
      : `<div style="width:22px;height:22px;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:.3">⊘</div>`;
    return `
      <div class="av-row" data-id="${x.tenantId}" data-elegivel="${elegivel}"
           style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #eee;${elegivel ? 'cursor:pointer' : 'opacity:.7'};${sel ? 'background:#f0f5ff' : ''}">
        ${check}
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${escapeHtml(x.nome)} <span style="color:#888;font-weight:400">· ${escapeHtml(x.fracao || '')}</span></div>
          <div style="font-size:13px;color:#666">${x.temEmail ? escapeHtml(x.email) : '— sem email —'}${badge}</div>
        </div>
        <div style="font-weight:700;color:#b3402f;white-space:nowrap">${x.valorFormatado}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    ${elegiveis.length > 0 ? `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;font-weight:600;user-select:none">
      <input type="checkbox" id="sel-todos" ${todosSel ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
      Selecionar todos <span style="font-weight:400;color:#888">(${elegiveis.length} por avisar)</span>
    </label>` : ''}
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden">${linhas}</div>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" id="btn-enviar" ${selecionados.size === 0 ? 'disabled' : ''}>Enviar aviso aos selecionados (${selecionados.size})</button>
      <div id="envio-progresso" style="font-size:14px;margin-top:6px"></div>
    </div>
  `;

  el.querySelectorAll('.av-row[data-elegivel="true"]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      if (selecionados.has(id)) selecionados.delete(id); else selecionados.add(id);
      renderEnviar();
    });
  });
  const selTodos = el.querySelector('#sel-todos');
  if (selTodos) selTodos.addEventListener('change', (e) => {
    if (e.target.checked) elegiveis.forEach(x => selecionados.add(x.tenantId)); else selecionados.clear();
    renderEnviar();
  });
  const btn = el.querySelector('#btn-enviar');
  if (btn && selecionados.size > 0) btn.addEventListener('click', () => {
    enviar(elegiveis.filter(x => selecionados.has(x.tenantId)));
  });
}

async function enviar(escolhidos) {
  const prog = containerRef.querySelector('#envio-progresso');
  const btn = containerRef.querySelector('#btn-enviar');
  const nomes = escolhidos.map(x => `• ${x.nome} (${x.valorFormatado})`).join('\n');
  if (!confirm(`Enviar aviso de atraso a ${escolhidos.length} condómino(s)?\n\n${nomes}\n\nOs emails saem de imediato.`)) return;
  btn.disabled = true;
  const operatorName = auth.getSession()?.operatorName || null;
  let ok = 0, falhou = 0; const erros = [];
  for (const item of escolhidos) {
    prog.innerHTML = `A enviar… ${ok + falhou + 1}/${escolhidos.length} (${escapeHtml(item.nome)})`;
    try { await avisos.enviarAviso(item, operatorName); ok++; }
    catch (e) { falhou++; erros.push(`${item.nome}: ${e?.message || e}`); }
  }
  selecionados.clear();
  prog.innerHTML = `
    <div style="color:#2f7d4f;font-weight:600">✓ ${ok} aviso(s) enviado(s) com sucesso.</div>
    ${falhou > 0 ? `<div style="color:#b3402f;margin-top:6px">${falhou} falhou(aram):<br>${erros.map(escapeHtml).join('<br>')}</div>` : ''}
  `;
  setTimeout(() => renderEnviar(), 2500);
}

async function renderHistorico() {
  const el = containerRef.querySelector('#avisos-conteudo');
  el.innerHTML = `<div style="padding:20px;color:#888">A carregar histórico…</div>`;
  const registos = await avisos.historicoAvisos();

  if (!registos || registos.length === 0) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#888">Ainda não há avisos enviados.</div>`;
    return;
  }

  const porMes = {};
  registos.forEach(r => {
    const m = r.mes || (r.enviadoEm ? new Date(r.enviadoEm).toISOString().slice(0, 7) : '—');
    (porMes[m] = porMes[m] || []).push(r);
  });
  const meses = Object.keys(porMes).sort().reverse();
  const nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const rotuloMes = (ym) => {
    const [a, m] = ym.split('-');
    const n = parseInt(m, 10);
    return (nomesMes[n - 1] || m) + ' ' + a;
  };

  const blocos = meses.map(ym => {
    const lista = porMes[ym].sort((a, b) => (b.enviadoEm || 0) - (a.enviadoEm || 0));
    const totalCent = lista.reduce((s, r) => s + (r.valorEmFalta_centimos || 0), 0);
    const linhas = lista.map(r => {
      const dt = r.enviadoEm ? new Date(r.enviadoEm).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f0f0f0">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${escapeHtml(r.tenantNome || r.tenantId)} <span style="color:#888;font-weight:400">· ${escapeHtml(r.fracao || '')}</span></div>
            <div style="font-size:12px;color:#666">${escapeHtml(r.email || '')} · ${dt}${r.enviadoPor ? ' · por ' + escapeHtml(r.enviadoPor) : ''}</div>
          </div>
          <div style="font-weight:700;color:#b3402f;white-space:nowrap">${formatMoney(r.valorEmFalta_centimos || 0)}</div>
        </div>`;
    }).join('');
    return `
      <div style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 4px">
          <div style="font-size:16px;font-weight:700;color:#1E3A6E">${rotuloMes(ym)}</div>
          <div style="font-size:13px;color:#888">${lista.length} aviso(s) · ${formatMoney(totalCent)}</div>
        </div>
        <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden">${linhas}</div>
      </div>`;
  }).join('');

  el.innerHTML = blocos;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
