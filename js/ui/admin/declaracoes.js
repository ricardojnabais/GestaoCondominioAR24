/**
 * Página: Declarações · Admin
 * Emite a Declaração de Não Dívida ao Condomínio (art. 1424.º-A CC) em PDF,
 * para efeitos de venda de fração.
 *
 * Fluxo:
 *  1. Escolher o condómino que vai vender.
 *  2. Resumo pré-preenchido com dados do sistema.
 *  3. PISCOS de confirmação em cada afirmação (obrigatórios).
 *  4. Pergunta sobre pagamentos/dívidas NÃO registados (adicionar manual).
 *  5. Ponto 4 opcional (quota extraordinária).
 *  6. Só com tudo confirmado → Gerar declaração (PDF descarregado) + registo.
 */

import * as store from '../../store/local-store.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import * as declPdf from '../../modules/declaracao-pdf.js';
import * as emAberto from '../../modules/em-aberto.js';
import { icon } from '../icons.js';
import { formatMoney, todayISO } from '../../utils/format.js';

let containerRef = null;
let abaAtiva = 'emitir';

export async function render(container) {
  containerRef = container;
  abaAtiva = 'emitir';
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
              <div class="breadcrumb">Documentos</div>
              <h1>Declarações</h1>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin:4px 0 16px;border-bottom:2px solid #eee">
          <button class="dc-aba" data-aba="emitir" style="background:none;border:none;padding:10px 16px;font-size:15px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px">Emitir declaração</button>
          <button class="dc-aba" data-aba="historico" style="background:none;border:none;padding:10px 16px;font-size:15px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px">Histórico</button>
        </div>

        <div id="dc-conteudo"><div style="padding:20px;color:#888">A carregar…</div></div>
      </main>
    </div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelectorAll('.dc-aba').forEach(b => {
    b.addEventListener('click', () => { abaAtiva = b.dataset.aba; pintarAbas(); renderAba(); });
  });
  pintarAbas();
  await renderAba();
}

function pintarAbas() {
  containerRef.querySelectorAll('.dc-aba').forEach(b => {
    const ativo = b.dataset.aba === abaAtiva;
    b.style.color = ativo ? '#1E54C7' : '#888';
    b.style.borderBottomColor = ativo ? '#1E54C7' : 'transparent';
  });
}

async function renderAba() {
  if (abaAtiva === 'historico') return renderHistorico();
  return renderEmitir();
}

// ─────────────── EMITIR ───────────────
async function renderEmitir() {
  const el = containerRef.querySelector('#dc-conteudo');
  const tenants = (await store.listDocs('tenants'))
    .filter(t => !t.inativoEm)
    .sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));

  const opcoes = tenants.map(t =>
    `<option value="${t.id}">${escapeHtml(t.fraction || '')} · ${escapeHtml(t.name || '')}</option>`
  ).join('');

  el.innerHTML = `
    <div style="background:#fdf6e3;border-left:4px solid #B8924A;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px">
      <strong>Declaração de Não Dívida ao Condomínio</strong> (art. 1424.º-A do Código Civil), para efeitos de venda.
      O resumo é pré-preenchido com os dados do sistema, mas <strong>tens de confirmar cada ponto</strong> antes de emitir.
      A responsabilidade da declaração é do administrador que a assina.
    </div>

    <div class="field" style="margin-bottom:16px">
      <label style="font-weight:600;display:block;margin-bottom:6px">Condómino que vai vender</label>
      <select id="dc-tenant" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px">
        <option value="">— escolher —</option>
        ${opcoes}
      </select>
    </div>

    <div id="dc-form"></div>
  `;

  el.querySelector('#dc-tenant').addEventListener('change', (e) => {
    if (e.target.value) montarForm(e.target.value);
    else el.querySelector('#dc-form').innerHTML = '';
  });
}

async function montarForm(tenantId) {
  const formEl = containerRef.querySelector('#dc-form');
  formEl.innerHTML = `<div style="padding:16px;color:#888">A calcular situação…</div>`;

  const tenant = await store.getDoc('tenants', tenantId);
  const ano = new Date().getFullYear().toString();
  const quotaCent = tenant?.rentByYear?.[ano] || 0;

  // Detetar dívidas via em-aberto
  let emFalta = 0;
  try {
    const atrasos = await emAberto.quotasAtrasoAnoCorrente();
    const meu = atrasos.find(a => a.tenantId === tenantId);
    emFalta = meu ? meu.totalEmFalta : 0;
  } catch (e) { emFalta = 0; }

  const semDividasSistema = emFalta === 0;
  const quotaTxt = formatMoney(quotaCent);

  formEl.innerHTML = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:16px;margin-bottom:16px">
      <div style="font-weight:700;margin-bottom:4px">${escapeHtml(tenant.name || '')}</div>
      <div style="color:#666;font-size:14px;margin-bottom:14px">Fração ${escapeHtml(tenant.fraction || '')} · NIF ${escapeHtml(tenant.nif || '—')}</div>

      <div style="font-size:13px;color:#888;margin-bottom:8px">Confirma cada afirmação (obrigatório):</div>

      <label class="dc-check" style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:pointer">
        <input type="checkbox" class="dc-pisco" style="margin-top:3px;width:18px;height:18px">
        <span>As quotas ordinárias encontram-se pagas até
          <input type="text" id="dc-pagas-ate" value="dia 8 de ${nomeMesAtual()} de ${ano}" style="border:none;border-bottom:1px solid #cbd5e1;font-size:14px;width:220px">
        </span>
      </label>

      <label class="dc-check" style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:pointer">
        <input type="checkbox" class="dc-pisco" style="margin-top:3px;width:18px;height:18px">
        <span>
          Situação de dívidas segundo o sistema:
          <strong style="color:${semDividasSistema ? '#2f7d4f' : '#b3402f'}">
            ${semDividasSistema ? 'sem dívidas' : 'existe dívida de ' + formatMoney(emFalta)}
          </strong>
        </span>
      </label>

      <label class="dc-check" style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:pointer">
        <input type="checkbox" class="dc-pisco" style="margin-top:3px;width:18px;height:18px">
        <span>Confirmo o valor da quota mensal ordinária: <strong>${quotaTxt}</strong></span>
      </label>

      <div style="border-top:1px solid #eee;margin:12px 0;padding-top:12px">
        <div style="font-weight:600;margin-bottom:6px">Existem pagamentos ou dívidas NÃO registados no sistema?</div>
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;padding:4px 0">
          <input type="radio" name="dc-outros" value="nao" checked> Não, o sistema reflete tudo.
        </label>
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;padding:4px 0">
          <input type="radio" name="dc-outros" value="sim"> Sim, quero acrescentar/corrigir manualmente:
        </label>
        <textarea id="dc-outros-txt" placeholder="Descreve as dívidas: natureza, montantes, datas de constituição e vencimento." style="width:100%;margin-top:6px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;min-height:60px;display:none"></textarea>
      </div>

      <div style="border-top:1px solid #eee;margin:12px 0;padding-top:12px">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-bottom:6px">
          <input type="checkbox" id="dc-extra-on" style="width:18px;height:18px">
          <span style="font-weight:600">Incluir ponto 4 · quota extraordinária</span>
        </label>
        <textarea id="dc-extra-txt" placeholder="Ex.: Encontra-se prevista uma quota mensal extraordinária, aprovada pela Assembleia Geral de DD/MM/AAAA, no valor de XX€, a pagar durante AAAA, para obras de conservação do…" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;min-height:70px;display:none"></textarea>
      </div>
    </div>

    <button class="btn primary" id="dc-gerar" disabled style="width:100%">
      Confirma todos os piscos para gerar
    </button>
    <div id="dc-msg" style="margin-top:10px;font-size:14px"></div>
  `;

  // Guardar dados calculados para a geração
  formEl.dataset.tenantId = tenantId;
  formEl._dados = {
    tenant, ano, quotaCent, quotaTxt, semDividasSistema, emFalta,
    andar: tenant.fraction || '',
  };

  // Lógica dos piscos → ativar botão
  const piscos = [...formEl.querySelectorAll('.dc-pisco')];
  const btn = formEl.querySelector('#dc-gerar');
  function reavaliar() {
    const todos = piscos.every(p => p.checked);
    btn.disabled = !todos;
    btn.textContent = todos ? 'Gerar declaração (PDF)' : 'Confirma todos os piscos para gerar';
  }
  piscos.forEach(p => p.addEventListener('change', reavaliar));

  // Radio "outros" → mostrar textarea
  formEl.querySelectorAll('input[name="dc-outros"]').forEach(r => {
    r.addEventListener('change', () => {
      formEl.querySelector('#dc-outros-txt').style.display =
        formEl.querySelector('input[name="dc-outros"]:checked').value === 'sim' ? 'block' : 'none';
    });
  });
  // Extraordinária → mostrar textarea
  formEl.querySelector('#dc-extra-on').addEventListener('change', (e) => {
    formEl.querySelector('#dc-extra-txt').style.display = e.target.checked ? 'block' : 'none';
  });

  btn.addEventListener('click', () => gerar(formEl));
}

async function gerar(formEl) {
  const msg = formEl.querySelector('#dc-msg');
  const dados = formEl._dados;
  const tenant = dados.tenant;
  const ano = dados.ano;

  const outrosSim = formEl.querySelector('input[name="dc-outros"]:checked').value === 'sim';
  const outrosTxt = formEl.querySelector('#dc-outros-txt').value.trim();
  const extraOn = formEl.querySelector('#dc-extra-on').checked;
  const extraTxt = formEl.querySelector('#dc-extra-txt').value.trim();
  const pagasAte = formEl.querySelector('#dc-pagas-ate').value.trim();

  // Determinar "sem dívidas" final: sistema + eventual acréscimo manual
  let semDividas = dados.semDividasSistema;
  let dividasTexto = '';
  if (!dados.semDividasSistema) {
    semDividas = false;
    dividasTexto = formatMoney(dados.emFalta);
  }
  if (outrosSim && outrosTxt) {
    // acréscimo manual de dívidas → deixa de ser "sem dívidas"
    semDividas = false;
    dividasTexto = dividasTexto ? `${dividasTexto}; ${outrosTxt}` : outrosTxt;
  }

  // Número sequencial próprio das declarações
  const numero = await proximoNumeroDeclaracao(ano);

  // Nomes dos administradores (para as duas assinaturas) · fonte dinâmica
  let administradores = [];
  try {
    const metaCfg = await store.getDoc('meta', 'config');
    administradores = metaCfg?.administracao?.nomes || [];
  } catch (e) { administradores = []; }

  const payload = {
    numero, ano,
    fracao: tenant.fraction || '',
    andar: dados.andar,
    nomeCondomino: tenant.name || '',
    quotaMensalTxt: dados.quotaTxt,
    pagasAte,
    semDividas,
    dividasTexto,
    extraordinariaTexto: (extraOn && extraTxt) ? extraTxt : '',
    operatorName: auth.getSession()?.operatorName || null,
    administradores,
    dataEmissaoTxt: dataPorExtensoSimples(),
  };

  try {
    const filename = await declPdf.gerarDeclaracaoPDF(payload);

    // Registo de prova (coleção declaracoes)
    const registo = {
      id: `decl_${ano}_${String(numero).padStart(3, '0')}`,
      numero, ano,
      tenantId: tenant.id,
      tenantNome: tenant.name || '',
      fracao: tenant.fraction || '',
      andar: dados.andar || '',
      nif: tenant.nif || '',
      semDividas,
      dividasTexto,
      quotaMensal_centimos: dados.quotaCent,
      quotaMensalTxt: dados.quotaTxt,
      pagasAte,
      extraordinariaTexto: (extraOn && extraTxt) ? extraTxt : '',
      administradores,
      dataEmissaoTxt: payload.dataEmissaoTxt,
      ficheiro: filename,
      emitidoEm: Date.now(),
      emitidoPor: payload.operatorName,
    };
    await store.setDoc('declaracoes', registo);

    msg.innerHTML = `<div style="color:#2f7d4f;font-weight:600">✓ Declaração ${String(numero).padStart(3,'0')}/${ano} gerada: ${escapeHtml(filename)}.<br>Foi descarregada. Anexa-a ao email no teu iPhone para enviar.</div>`;
  } catch (e) {
    msg.innerHTML = `<div style="color:#b3402f">Erro ao gerar: ${escapeHtml(e?.message || String(e))}</div>`;
  }
}

/** Contador próprio das declarações (meta.nextDeclByYear). */
async function proximoNumeroDeclaracao(ano) {
  const meta = await store.getDoc('meta', 'config');
  if (!meta.nextDeclByYear) meta.nextDeclByYear = {};
  const atual = meta.nextDeclByYear[ano] || 1;
  meta.nextDeclByYear[ano] = atual + 1;
  await store.setDoc('meta', meta);
  return atual;
}

// ─────────────── HISTÓRICO ───────────────
async function renderHistorico() {
  const el = containerRef.querySelector('#dc-conteudo');
  el.innerHTML = `<div style="padding:20px;color:#888">A carregar…</div>`;
  const regs = (await store.listDocs('declaracoes'))
    .sort((a, b) => (b.emitidoEm || 0) - (a.emitidoEm || 0));

  if (regs.length === 0) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#888">Ainda não foram emitidas declarações.</div>`;
    return;
  }

  const linhas = regs.map(r => {
    const dt = r.emitidoEm ? new Date(r.emitidoEm).toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    return `
      <div class="dc-hist-row" data-id="${r.id}" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600">Decl. ${String(r.numero).padStart(3,'0')}/${r.ano} · ${escapeHtml(r.tenantNome || '')} <span style="color:#888;font-weight:400">· ${escapeHtml(r.fracao || '')}</span></div>
          <div style="font-size:12px;color:#666">${dt}${r.emitidoPor ? ' · por ' + escapeHtml(r.emitidoPor) : ''} · ${r.semDividas ? 'sem dívidas' : 'com dívidas'}</div>
        </div>
        <div style="color:#1E54C7;font-size:13px;white-space:nowrap">📄 Abrir</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:13px;color:#888;margin-bottom:8px">Toca numa declaração para voltar a descarregar o PDF.</div>
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden">${linhas}</div>
    <div id="dc-hist-msg" style="margin-top:10px;font-size:14px"></div>
  `;

  const mapa = {};
  regs.forEach(r => { mapa[r.id] = r; });
  el.querySelectorAll('.dc-hist-row').forEach(row => {
    row.addEventListener('click', () => reabrir(mapa[row.dataset.id]));
  });
}

/** Regenera e descarrega o PDF de uma declaração já emitida (mantém nº e data originais). */
async function reabrir(registo) {
  const msg = containerRef.querySelector('#dc-hist-msg');
  if (!registo) return;
  msg.innerHTML = `<span style="color:#888">A gerar PDF…</span>`;
  try {
    const payload = {
      numero: registo.numero,
      ano: registo.ano,
      fracao: registo.fracao || '',
      andar: registo.andar || '',
      nomeCondomino: registo.tenantNome || '',
      quotaMensalTxt: registo.quotaMensalTxt || formatMoney(registo.quotaMensal_centimos || 0),
      pagasAte: registo.pagasAte || '',
      semDividas: registo.semDividas,
      dividasTexto: registo.dividasTexto || '',
      extraordinariaTexto: registo.extraordinariaTexto || '',
      administradores: registo.administradores || [],
      operatorName: registo.emitidoPor || null,
      dataEmissaoTxt: registo.dataEmissaoTxt || '',
    };
    const filename = await declPdf.gerarDeclaracaoPDF(payload);
    msg.innerHTML = `<span style="color:#2f7d4f;font-weight:600">✓ ${escapeHtml(filename)} descarregado.</span>`;
  } catch (e) {
    msg.innerHTML = `<span style="color:#b3402f">Erro ao gerar: ${escapeHtml(e?.message || String(e))}</span>`;
  }
}

// ─────────────── helpers ───────────────
function nomeMesAtual() {
  return ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][new Date().getMonth()];
}
function dataPorExtensoSimples() {
  const d = new Date();
  return `${d.getDate()} de ${nomeMesAtual()} de ${d.getFullYear()}`;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  ));
}
