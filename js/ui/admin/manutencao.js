/**
 * Página: Calendário & Manutenção · Admin · v1.0.49
 * Calendário mensal + agenda de manutenções recorrentes e eventos pontuais
 * (ex.: reunião de condomínio). Ações por item num menu compacto.
 */

import * as manut from '../../modules/manutencoes.js';
import * as comunicacoes from '../../modules/comunicacoes.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as auth from '../../auth/local-auth.js';
import { icon } from '../icons.js';
import { formatDate, todayISO } from '../../utils/format.js';

let containerRef = null;
let itensCache = [];
const state = { mes: null, ano: null, diaFiltro: null, menuAberto: null };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const CSS = `
<style>
.cal-wrap{background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.cal-title{font-weight:700;font-size:15px}
.cal-nav{border:none;background:#f0f2f5;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer}
.cal-nav{color:#234}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-dowc{text-align:center;font-size:11px;color:#8a93a0;padding:2px 0;font-weight:600}
.cal-cell{aspect-ratio:1/1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;position:relative}
.cal-cell.empty{background:transparent}
.cal-cell.has{background:#f5f7fa;cursor:pointer}
.cal-cell.hoje{outline:2px solid #2f6df6;font-weight:700}
.cal-cell.sel{background:#2f6df6;color:#fff}
.cal-dots{display:flex;gap:2px;height:6px;margin-top:2px}
.cal-dot{width:5px;height:5px;border-radius:50%}
.agenda-mes{font-weight:700;color:#234;margin:16px 2px 8px;font-size:14px}
.agenda-filtro{background:#eef3ff;border-radius:10px;padding:8px 12px;font-size:13px;margin-bottom:8px}
.agenda-filtro a{color:#2f6df6;cursor:pointer;text-decoration:underline}
.ag-card{display:flex;gap:12px;background:#fff;border-radius:12px;padding:12px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,.06);align-items:flex-start}
.ag-date{flex:0 0 46px;text-align:center;border-radius:10px;background:#f5f7fa;padding:6px 0}
.ag-d{font-size:20px;font-weight:800;line-height:1}
.ag-m{font-size:11px;text-transform:uppercase}
.ag-body{flex:1;min-width:0}
.ag-title{font-weight:700;font-size:15px}
.ag-evt{font-size:10px;background:#6c5ce7;color:#fff;padding:1px 6px;border-radius:8px;vertical-align:middle;margin-left:4px}
.ag-meta{font-size:12px;color:#8a93a0;margin-top:2px}
.ag-when{font-size:12px;font-weight:700;margin-top:4px}
.ag-actions{position:relative;flex:0 0 auto}
.card-menu-btn{border:none;background:#f0f2f5;width:32px;height:32px;border-radius:8px;font-size:18px;cursor:pointer;line-height:1}
.card-menu{display:none;position:absolute;right:0;top:36px;background:#fff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.16);z-index:20;min-width:190px;overflow:hidden}
.card-menu.open{display:block}
.card-menu button{display:block;width:100%;text-align:left;border:none;background:#fff;padding:11px 14px;font-size:14px;cursor:pointer}
.card-menu button:hover{background:#f5f7fa}
.card-menu button.danger{color:#c0392b}
</style>`;

export async function render(container) {
  containerRef = container;
  const hoje = new Date();
  if (state.mes === null) { state.mes = hoje.getMonth(); state.ano = hoje.getFullYear(); }
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
              <div class="breadcrumb">Manutenções e eventos do condomínio</div>
              <h1>Agenda</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Novo</button>
          </div>
        </div>
        ${CSS}
        <div id="cal"></div>
        <div id="agenda" style="margin-top:14px">A carregar…</div>
      </main>
    </div>
    <div id="manut-modal"></div>
  `;
  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#btn-new').addEventListener('click', () => abrirForm(null));
  document.addEventListener('click', fecharMenus);
  await reload();
}

export function cleanup() { document.removeEventListener('click', fecharMenus); }

function fecharMenus() {
  if (!containerRef) return;
  containerRef.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open'));
  state.menuAberto = null;
}

async function reload() {
  itensCache = await manut.listar();
  renderCalendar();
  renderAgenda();
}

function renderCalendar() {
  const el = containerRef.querySelector('#cal');
  const { mes, ano } = state;
  const porDia = {};
  itensCache.forEach(m => {
    if (!m.proxima) return;
    const d = new Date(m.proxima + 'T00:00:00');
    if (d.getMonth() === mes && d.getFullYear() === ano) {
      (porDia[d.getDate()] = porDia[d.getDate()] || []).push(m);
    }
  });
  const primeiro = new Date(ano, mes, 1);
  const offset = (primeiro.getDay() + 6) % 7;
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hojeISO = todayISO();

  let celulas = '';
  for (let i = 0; i < offset; i++) celulas += `<div class="cal-cell empty"></div>`;
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const items = porDia[dia] || [];
    const dots = items.slice(0, 3).map(m => `<span class="cal-dot" style="background:${manut.ESTADO_INFO[m.estado].cor}"></span>`).join('');
    celulas += `<div class="cal-cell ${items.length ? 'has' : ''} ${iso === hojeISO ? 'hoje' : ''} ${state.diaFiltro === iso ? 'sel' : ''}" ${items.length ? `data-dia="${iso}"` : ''}>
      <span class="cal-num">${dia}</span><span class="cal-dots">${dots}</span></div>`;
  }

  el.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-head">
        <button class="cal-nav" id="cal-prev">‹</button>
        <div class="cal-title">${MESES[mes]} ${ano}</div>
        <button class="cal-nav" id="cal-next">›</button>
      </div>
      <div class="cal-grid">${DOW.map(d => `<div class="cal-dowc">${d}</div>`).join('')}</div>
      <div class="cal-grid" style="margin-top:3px">${celulas}</div>
    </div>`;
  el.querySelector('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  el.querySelector('#cal-next').addEventListener('click', () => shiftMonth(1));
  el.querySelectorAll('[data-dia]').forEach(c => c.addEventListener('click', () => {
    state.diaFiltro = (state.diaFiltro === c.dataset.dia) ? null : c.dataset.dia;
    renderCalendar(); renderAgenda();
  }));
}

function shiftMonth(delta) {
  let m = state.mes + delta, a = state.ano;
  if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; }
  state.mes = m; state.ano = a; state.diaFiltro = null;
  renderCalendar(); renderAgenda();
}

function renderAgenda() {
  const el = containerRef.querySelector('#agenda');
  let itens = itensCache.slice();
  let banner = '';
  if (state.diaFiltro) {
    itens = itens.filter(m => m.proxima === state.diaFiltro);
    banner = `<div class="agenda-filtro">A mostrar <strong>${formatDate(state.diaFiltro)}</strong> · <a id="limpar-filtro">ver todas</a></div>`;
  }
  if (!itens.length) {
    el.innerHTML = banner + `<div class="empty-state" style="padding:24px;text-align:center;color:#8a93a0">
      ${state.diaFiltro ? 'Nada neste dia.' : 'Ainda não há nada agendado.<br>Carrega em <strong>+ Novo</strong> (há modelos prontos para elevador, extintores, limpeza e reunião).'}</div>`;
    el.querySelector('#limpar-filtro')?.addEventListener('click', limparFiltro);
    return;
  }
  const grupos = {};
  itens.forEach(m => { const k = m.proxima ? m.proxima.slice(0, 7) : '9999-99'; (grupos[k] = grupos[k] || []).push(m); });
  let html = banner;
  Object.keys(grupos).sort().forEach(k => {
    const titulo = k === '9999-99' ? 'Sem data' : `${MESES[parseInt(k.slice(5), 10) - 1]} ${k.slice(0, 4)}`;
    html += `<div class="agenda-mes">${titulo}</div>` + grupos[k].map(buildCard).join('');
  });
  el.innerHTML = html;
  el.querySelector('#limpar-filtro')?.addEventListener('click', limparFiltro);
  el.querySelectorAll('.card-menu-btn').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = containerRef.querySelector('#menu-' + b.dataset.id);
    const jaAberto = menu.classList.contains('open');
    fecharMenus();
    if (!jaAberto) { menu.classList.add('open'); state.menuAberto = b.dataset.id; }
  }));
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation(); fecharMenus(); handleAction(b.dataset.act, b.dataset.id);
  }));
}

function limparFiltro() { state.diaFiltro = null; renderCalendar(); renderAgenda(); }

function buildCard(m) {
  const info = manut.ESTADO_INFO[m.estado];
  const dias = m.diasAte;
  const quando = !m.proxima ? 'sem data'
    : (m.estado === 'vencida' ? `vencida há ${Math.abs(dias)} dia(s)` : (dias === 0 ? 'hoje' : `daqui a ${dias} dia(s)`));
  const d = m.proxima ? new Date(m.proxima + 'T00:00:00') : null;
  const diaNum = d ? d.getDate() : '–';
  const mesAbr = d ? MESES[d.getMonth()].slice(0, 3) : '';
  const isEvento = m.modo === 'pontual';
  const sub = isEvento ? 'Evento pontual'
    : manut.textoPeriodicidade(m.periodicidadeValor, m.periodicidadeUnidade, m.diaSemana);
  return `
  <div class="ag-card" style="border-left:4px solid ${info.cor}">
    <div class="ag-date" style="color:${info.cor}"><div class="ag-d">${diaNum}</div><div class="ag-m">${mesAbr}</div></div>
    <div class="ag-body">
      <div class="ag-title">${escapeHtml(m.nome)}${isEvento ? '<span class="ag-evt">evento</span>' : ''}</div>
      <div class="ag-meta">${escapeHtml(sub)}${m.categoria ? ` · ${escapeHtml(m.categoria)}` : ''}</div>
      <div class="ag-when" style="color:${info.cor}">${info.label} · ${quando}</div>
    </div>
    <div class="ag-actions">
      <button class="card-menu-btn" data-id="${m.id}">⋯</button>
      <div class="card-menu" id="menu-${m.id}">
        ${!isEvento ? `<button data-act="feita" data-id="${m.id}">✓ Registar realização</button>` : ''}
        <button data-act="avisar" data-id="${m.id}">📢 Avisar condóminos</button>
        <button data-act="editar" data-id="${m.id}">✎ Editar</button>
        <button data-act="apagar" data-id="${m.id}" class="danger">🗑 Apagar</button>
      </div>
    </div>
  </div>`;
}

async function handleAction(act, id) {
  const m = itensCache.find(x => x.id === id);
  if (!m) return;
  if (act === 'feita') {
    const dt = prompt('Data da realização (AAAA-MM-DD):', todayISO());
    if (!dt) return;
    await manut.registarRealizacao(id, dt); await reload(); return;
  }
  if (act === 'editar') { abrirForm(m); return; }
  if (act === 'apagar') {
    if (!confirm(`Apagar "${m.nome}"?`)) return;
    await manut.remover(id); await reload(); return;
  }
  if (act === 'avisar') { await avisar(m); return; }
}

async function avisar(m) {
  const proximaFmt = m.proxima ? formatDate(m.proxima) : '(a definir)';
  const assunto = `${m.modo === 'pontual' ? 'Evento' : 'Manutenção'}: ${m.nome}`;
  const mensagem =
`Caros condóminos,

Informa-se que está prevista a seguinte ${m.modo === 'pontual' ? 'reunião/evento' : 'intervenção'}:

• ${m.nome}${m.categoria ? ` (${m.categoria})` : ''}
• Data prevista: ${proximaFmt}
${m.notas ? `\n${m.notas}\n` : ''}
Com os melhores cumprimentos,
A Administração`;

  if (!confirm(`Vais avisar os condóminos sobre "${m.nome}".\n\n1) Publica uma comunicação na app\n2) Abre o teu email (condóminos em Bcc) para enviares\n\nContinuar?`)) return;
  try {
    const session = auth.getSession();
    await comunicacoes.criarPorAdmin({ tipo: 'institucional', assunto, mensagem }, session?.operatorName);
  } catch (e) { alert('Não foi possível publicar a comunicação: ' + e.message); return; }

  const tenants = await store.listDocs('tenants');
  const emails = [...new Set(tenants.map(t => (t.email || '').trim()).filter(Boolean))];
  if (emails.length) {
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`;
    alert(`Comunicação publicada ✓\nAbri o teu email com ${emails.length} condómino(s) em Bcc.`);
  } else {
    alert('Comunicação publicada ✓\nNão há emails de condóminos registados.');
  }
}

// ─── Formulário ──────────────────────────────────────────────────────
function abrirForm(m) {
  const isEdit = !!m;
  const modo = m?.modo === 'pontual' ? 'pontual' : 'recorrente';
  const chipBtns = manut.PRESETS.map(p =>
    `<button type="button" class="btn ghost chip-per" data-v="${p.valor}" data-u="${p.unidade}" style="padding:5px 10px;font-size:12px">${p.label}</button>`).join('');
  const unidadeOpts = Object.keys(manut.UNIDADES).map(u =>
    `<option value="${u}" ${((m?.periodicidadeUnidade) || 'meses') === u ? 'selected' : ''}>${manut.UNIDADES[u].label}</option>`).join('');
  const modeloBtns = manut.MODELOS.map((mod, i) =>
    `<button type="button" class="btn ghost mod-btn" data-i="${i}" style="padding:6px 10px;font-size:12px">${escapeHtml(mod.nome)}</button>`).join('');

  const host = containerRef.querySelector('#manut-modal');
  host.innerHTML = `
    <div class="modal-overlay" id="ov" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:1000;overflow:auto;padding:24px 12px">
      <div class="modal-card" style="background:#fff;border-radius:16px;max-width:520px;width:100%;padding:20px">
        <h2 style="margin:0 0 10px 0">${isEdit ? 'Editar' : 'Novo'}</h2>
        ${isEdit ? '' : `<div style="margin-bottom:14px">
          <div style="font-size:12px;color:#8a93a0;margin-bottom:6px">Modelos rápidos:</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${modeloBtns}</div></div>`}

        <div class="field"><label>Tipo</label>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn ghost modo-btn" data-modo="recorrente" style="flex:1">Manutenção recorrente</button>
            <button type="button" class="btn ghost modo-btn" data-modo="pontual" style="flex:1">Evento pontual</button>
          </div>
        </div>

        <div class="field"><label>Nome *</label><input type="text" id="m-nome" value="${escapeAttr(m?.nome || '')}" placeholder="ex: Reunião de condomínio"></div>
        <div class="field"><label>Categoria (opcional)</label><input type="text" id="m-cat" value="${escapeAttr(m?.categoria || '')}" placeholder="ex: Elevador, Incêndio, Assembleia"></div>

        <div id="bloco-pontual" style="display:none">
          <div class="field"><label>Data do evento *</label><input type="date" id="m-evento" value="${m?.dataEvento || todayISO()}"></div>
        </div>

        <div id="bloco-recorrente">
          <div class="field"><label>Data da última realização *</label><input type="date" id="m-ultima" value="${m?.dataUltima || todayISO()}"></div>
          <div class="field">
            <label>Repetição</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chipBtns}</div>
            <div style="display:flex;gap:10px;align-items:center">
              <span style="color:#8a93a0">A cada</span>
              <input type="number" id="m-valor" min="1" value="${m?.periodicidadeValor || 1}" style="width:90px">
              <select id="m-unidade" style="flex:1">${unidadeOpts}</select>
            </div>
            <div style="margin-top:10px">
              <label style="font-size:13px;color:#8a93a0">Dia da semana (opcional)</label>
              <select id="m-diasemana">
                <option value="">Qualquer dia</option>
                ${manut.WEEKDAYS.map(w => `<option value="${w.v}" ${String(m?.diaSemana) === String(w.v) ? 'selected' : ''}>${w.label}</option>`).join('')}
              </select>
            </div>
            <div id="m-resumo" style="margin-top:10px;font-weight:700;color:#2f6df6;font-size:15px"></div>
          </div>
        </div>

        <div class="field"><label>Avisar com antecedência (dias)</label><input type="number" id="m-aviso" min="0" value="${m?.diasAviso ?? 30}"></div>
        <div class="field"><label>Notas (opcional)</label><textarea id="m-notas" rows="2">${escapeHtml(m?.notas || '')}</textarea></div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn ghost" id="m-cancel" style="flex:1">Cancelar</button>
          <button class="btn primary" id="m-save" style="flex:1">${isEdit ? 'Guardar' : 'Criar'}</button>
        </div>
      </div>
    </div>`;

  let modoAtual = modo;
  const close = () => { host.innerHTML = ''; };
  host.querySelector('#ov').addEventListener('click', (e) => { if (e.target.id === 'ov') close(); });
  host.querySelector('#m-cancel').addEventListener('click', close);

  function aplicarModo(novo) {
    modoAtual = novo;
    host.querySelector('#bloco-pontual').style.display = novo === 'pontual' ? 'block' : 'none';
    host.querySelector('#bloco-recorrente').style.display = novo === 'recorrente' ? 'block' : 'none';
    host.querySelectorAll('.modo-btn').forEach(b => {
      const on = b.dataset.modo === novo;
      b.classList.toggle('primary', on);
      b.classList.toggle('ghost', !on);
    });
  }
  host.querySelectorAll('.modo-btn').forEach(b => b.addEventListener('click', () => aplicarModo(b.dataset.modo)));
  aplicarModo(modo);

  const valorEl = host.querySelector('#m-valor');
  const unidadeEl = host.querySelector('#m-unidade');
  const diaSemEl = host.querySelector('#m-diasemana');
  const resumoEl = host.querySelector('#m-resumo');
  const atualizarResumo = () => { resumoEl.textContent = manut.textoPeriodicidade(valorEl.value, unidadeEl.value, diaSemEl.value); };
  valorEl.addEventListener('input', atualizarResumo);
  unidadeEl.addEventListener('change', atualizarResumo);
  diaSemEl.addEventListener('change', atualizarResumo);
  host.querySelectorAll('.chip-per').forEach(c => c.addEventListener('click', () => {
    valorEl.value = c.dataset.v; unidadeEl.value = c.dataset.u; atualizarResumo();
  }));
  atualizarResumo();

  host.querySelectorAll('.mod-btn').forEach(b => b.addEventListener('click', () => {
    const mod = manut.MODELOS[parseInt(b.dataset.i, 10)];
    host.querySelector('#m-nome').value = mod.nome;
    host.querySelector('#m-cat').value = mod.categoria || '';
    host.querySelector('#m-aviso').value = mod.diasAviso ?? 30;
    host.querySelector('#m-notas').value = mod.notas || '';
    if (mod.modo === 'pontual') {
      aplicarModo('pontual');
    } else {
      aplicarModo('recorrente');
      valorEl.value = mod.valor; unidadeEl.value = mod.unidade;
      diaSemEl.value = (mod.diaSemana == null) ? '' : String(mod.diaSemana);
      atualizarResumo();
    }
  }));

  host.querySelector('#m-save').addEventListener('click', async () => {
    const data = {
      modo: modoAtual,
      nome: host.querySelector('#m-nome').value,
      categoria: host.querySelector('#m-cat').value,
      dataEvento: host.querySelector('#m-evento').value,
      dataUltima: host.querySelector('#m-ultima').value,
      periodicidadeValor: valorEl.value,
      periodicidadeUnidade: unidadeEl.value,
      diaSemana: diaSemEl.value,
      diasAviso: host.querySelector('#m-aviso').value,
      notas: host.querySelector('#m-notas').value
    };
    try {
      if (isEdit) await manut.atualizar(m.id, data);
      else await manut.criar(data);
      close(); await reload();
    } catch (e) { alert('Erro: ' + e.message); }
  });
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
