/**
 * Página: Avisos de Atraso · Admin
 * Mostra os condóminos com quotas em atraso, permite enviar avisos por email
 * (EmailJS) só a quem tem email, e regista a prova de cada envio.
 */

import * as avisos from '../../modules/avisos-atraso.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

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
              <div class="breadcrumb">Cobrança</div>
              <h1>Avisos de Atraso</h1>
            </div>
          </div>
        </div>

        <div style="background:#eef2fb;border-left:4px solid #2E54A7;border-radius:8px;padding:12px 16px;margin:8px 0 16px;font-size:14px">
          Envia um email a cada condómino com quotas em atraso <strong>que tenha email</strong>.
          Revê a lista antes de enviar. Quem não tem email fica assinalado para contacto direto.
          Cada envio fica registado como prova.
        </div>

        <div id="avisos-conteudo"><div style="padding:20px;color:#888">A calcular atrasos…</div></div>
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));

  await renderConteudo();
}

async function renderConteudo() {
  const el = containerRef.querySelector('#avisos-conteudo');
  const [lista, jaAvisados] = await Promise.all([
    avisos.listarParaAviso(),
    avisos.jaAvisadosEsteMes(),
  ]);

  if (lista.length === 0) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#2f7d4f;font-weight:600">
      ✓ Nenhum condómino com quotas em atraso. Nada a enviar.
    </div>`;
    return;
  }

  const comEmail = lista.filter(x => x.temEmail);
  const semEmail = lista.filter(x => !x.temEmail);
  const porEnviar = comEmail.filter(x => !jaAvisados.has(x.tenantId));

  const linhas = lista.map(x => {
    const avisado = jaAvisados.has(x.tenantId);
    let estado, cor;
    if (!x.temEmail) { estado = 'Sem email · avisar à parte'; cor = '#b3402f'; }
    else if (avisado) { estado = 'Já avisado este mês'; cor = '#2f7d4f'; }
    else { estado = 'Por avisar'; cor = '#8a6a1a'; }

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #eee;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">${escapeHtml(x.nome)} <span style="color:#888;font-weight:400">· ${escapeHtml(x.fracao || '')}</span></div>
          <div style="font-size:13px;color:#666">${x.temEmail ? escapeHtml(x.email) : '— sem email —'}</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div style="font-weight:700;color:#b3402f">${x.valorFormatado}</div>
          <div style="font-size:12px;color:${cor}">${estado}</div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden">
      ${linhas}
    </div>

    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" id="btn-enviar" ${porEnviar.length === 0 ? 'disabled' : ''}>
        Enviar avisos por email (${porEnviar.length} ${porEnviar.length === 1 ? 'condómino' : 'condóminos'})
      </button>
      <div style="font-size:13px;color:#666">
        ${comEmail.length} com email · ${semEmail.length} sem email ·
        ${jaAvisados.size} já avisados este mês
      </div>
      <div id="envio-progresso" style="font-size:14px;margin-top:6px"></div>
    </div>
  `;

  const btn = el.querySelector('#btn-enviar');
  if (btn && porEnviar.length > 0) {
    btn.addEventListener('click', () => enviar(porEnviar));
  }
}

async function enviar(porEnviar) {
  const prog = containerRef.querySelector('#envio-progresso');
  const btn = containerRef.querySelector('#btn-enviar');

  const nomes = porEnviar.map(x => `• ${x.nome} (${x.valorFormatado})`).join('\n');
  if (!confirm(`Enviar aviso de atraso a ${porEnviar.length} condómino(s)?\n\n${nomes}\n\nOs emails saem de imediato.`)) return;

  btn.disabled = true;
  const operatorName = auth.getSession()?.operatorName || null;
  let ok = 0, falhou = 0;
  const erros = [];

  for (const item of porEnviar) {
    prog.innerHTML = `A enviar… ${ok + falhou + 1}/${porEnviar.length} (${escapeHtml(item.nome)})`;
    try {
      await avisos.enviarAviso(item, operatorName);
      ok++;
    } catch (e) {
      falhou++;
      erros.push(`${item.nome}: ${e?.message || e}`);
    }
  }

  prog.innerHTML = `
    <div style="color:#2f7d4f;font-weight:600">✓ ${ok} aviso(s) enviado(s) com sucesso.</div>
    ${falhou > 0 ? `<div style="color:#b3402f;margin-top:6px">${falhou} falhou(aram):<br>${erros.map(escapeHtml).join('<br>')}</div>` : ''}
  `;

  // Recarregar a lista (para refletir "já avisado")
  setTimeout(() => renderConteudo(), 2500);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
