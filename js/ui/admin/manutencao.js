/**
 * Página: Manutenção Periódica · Admin · v1.0.46
 * Lista de manutenções recorrentes com próxima data, e ações:
 * registar realização, avisar condóminos (comunicação + email), editar, apagar.
 */

import * as manut from '../../modules/manutencoes.js';
import * as comunicacoes from '../../modules/comunicacoes.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as auth from '../../auth/local-auth.js';
import { icon } from '../icons.js';
import { formatDate, todayISO } from '../../utils/format.js';

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
              <div class="breadcrumb">Calendário de manutenções e inspeções</div>
              <h1>Manutenção Periódica</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Nova</button>
          </div>
        </div>
        <div id="lista" style="margin-top:8px">A carregar…</div>
      </main>
    </div>
    <div id="manut-modal"></div>
  `;

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#btn-new').addEventListener('click', () => abrirForm(null));

  await renderList();
}

async function renderList() {
  const lista = containerRef.querySelector('#lista');
  const itens = await manut.listar();
  if (!itens.length) {
    lista.innerHTML = `<div class="empty-state" style="padding:24px;text-align:center;color:var(--text-soft)">
      Ainda não há manutenções registadas.<br>Carrega em <strong>+ Nova</strong> para começar (há modelos prontos para elevador e extintores).</div>`;
    return;
  }
  lista.innerHTML = itens.map(buildCard).join('');
  lista.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', () => handleAction(b.dataset.act, b.dataset.id));
  });
}

function buildCard(m) {
  const info = manut.ESTADO_INFO[m.estado];
  const dias = m.diasAte;
  const quando = m.estado === 'vencida'
    ? `há ${Math.abs(dias)} dia(s)`
    : (dias === 0 ? 'hoje' : `daqui a ${dias} dia(s)`);
  return `
  <div class="mov" style="align-items:flex-start;border-left:4px solid ${info.cor}">
    <div class="mov-txt" style="flex:1">
      <div class="mov-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${escapeHtml(m.nome)}
        <span style="font-size:11px;font-weight:700;color:#fff;background:${info.cor};padding:2px 8px;border-radius:10px">${info.label}</span>
        ${m.categoria ? `<span style="font-size:11px;color:var(--text-soft)">· ${escapeHtml(m.categoria)}</span>` : ''}
      </div>
      <div class="mov-meta">
        Próxima: <strong>${m.proxima ? formatDate(m.proxima) : '—'}</strong> (${quando})
        · ${manut.textoPeriodicidade(m.periodicidadeValor, m.periodicidadeUnidade, m.diaSemana)}
        · última: ${formatDate(m.dataUltima)}
      </div>
      ${m.notas ? `<div class="mov-desc" style="margin-top:4px">${escapeHtml(m.notas)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn ghost" data-act="feita" data-id="${m.id}" style="padding:6px 10px;font-size:13px">✓ Registar realização</button>
        <button class="btn ghost" data-act="avisar" data-id="${m.id}" style="padding:6px 10px;font-size:13px">📢 Avisar condóminos</button>
        <button class="btn ghost" data-act="editar" data-id="${m.id}" style="padding:6px 10px;font-size:13px">Editar</button>
        <button class="btn ghost" data-act="apagar" data-id="${m.id}" style="padding:6px 10px;font-size:13px;color:#c0392b">Apagar</button>
      </div>
    </div>
  </div>`;
}

async function handleAction(act, id) {
  const itens = await manut.listar();
  const m = itens.find(x => x.id === id);
  if (!m) return;

  if (act === 'feita') {
    const d = prompt('Data da realização (AAAA-MM-DD):', todayISO());
    if (!d) return;
    await manut.registarRealizacao(id, d);
    await renderList();
    return;
  }
  if (act === 'editar') { abrirForm(m); return; }
  if (act === 'apagar') {
    if (!confirm(`Apagar a manutenção "${m.nome}"?`)) return;
    await manut.remover(id);
    await renderList();
    return;
  }
  if (act === 'avisar') { await avisar(m); return; }
}

async function avisar(m) {
  const proximaFmt = m.proxima ? formatDate(m.proxima) : '(a definir)';
  const assunto = `Manutenção: ${m.nome}`;
  const mensagem =
`Caros condóminos,

Informa-se que está prevista a seguinte intervenção:

• ${m.nome}${m.categoria ? ` (${m.categoria})` : ''}
• Data prevista: ${proximaFmt}
${m.notas ? `\n${m.notas}\n` : ''}
Com os melhores cumprimentos,
A Administração`;

  if (!confirm(`Vais avisar os condóminos sobre "${m.nome}".\n\nIsto vai:\n1) Publicar uma comunicação na app (visível a todos)\n2) Abrir o teu email já preenchido (condóminos em Bcc) para enviares\n\nContinuar?`)) return;

  // 1) Comunicação dentro da app
  try {
    const session = auth.getSession();
    await comunicacoes.criarPorAdmin({ tipo: 'institucional', assunto, mensagem }, session?.operatorName);
  } catch (e) {
    alert('Não foi possível publicar a comunicação: ' + e.message);
    return;
  }

  // 2) Email via mailto (condóminos em Bcc, para privacidade)
  const tenants = await store.listDocs('tenants');
  const emails = [...new Set(tenants.map(t => (t.email || '').trim()).filter(Boolean))];
  if (emails.length) {
    const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`;
    window.location.href = mailto;
    alert(`Comunicação publicada na app ✓\n\nAbri o teu email com ${emails.length} condómino(s) em Bcc — revê e carrega em enviar.`);
  } else {
    alert('Comunicação publicada na app ✓\n\nNão há emails de condóminos registados, por isso não abri o email. Podes adicionar emails em Condóminos.');
  }
}

// ─── Formulário (criar/editar) ───────────────────────────────────────
function abrirForm(m) {
  const isEdit = !!m;
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
        <h2 style="margin:0 0 4px 0">${isEdit ? 'Editar manutenção' : 'Nova manutenção'}</h2>
        ${isEdit ? '' : `<div style="margin:8px 0 14px 0">
          <div style="font-size:12px;color:var(--text-soft);margin-bottom:6px">Modelos rápidos (periodicidade legal):</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${modeloBtns}</div>
        </div>`}
        <div class="field"><label>Nome *</label><input type="text" id="m-nome" value="${escapeAttr(m?.nome || '')}" placeholder="ex: Elevador · inspeção periódica"></div>
        <div class="field"><label>Categoria (opcional)</label><input type="text" id="m-cat" value="${escapeAttr(m?.categoria || '')}" placeholder="ex: Elevador, Incêndio"></div>
        <div class="field"><label>Data da última realização *</label><input type="date" id="m-ultima" value="${m?.dataUltima || todayISO()}"></div>
        <div class="field">
          <label>Repetição</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chipBtns}</div>
          <div style="display:flex;gap:10px;align-items:center">
            <span style="color:var(--text-soft)">A cada</span>
            <input type="number" id="m-valor" min="1" value="${m?.periodicidadeValor || 1}" style="width:90px">
            <select id="m-unidade" style="flex:1">${unidadeOpts}</select>
          </div>
          <div style="margin-top:10px">
            <label style="font-size:13px;color:var(--text-soft)">Dia da semana (opcional)</label>
            <select id="m-diasemana">
              <option value="">Qualquer dia</option>
              ${manut.WEEKDAYS.map(w => `<option value="${w.v}" ${String(m?.diaSemana) === String(w.v) ? 'selected' : ''}>${w.label}</option>`).join('')}
            </select>
          </div>
          <div id="m-resumo" style="margin-top:10px;font-weight:700;color:var(--primary);font-size:15px"></div>
        </div>
        <div class="field"><label>Avisar com antecedência (dias)</label><input type="number" id="m-aviso" min="0" value="${m?.diasAviso ?? 30}"></div>
        <div class="field"><label>Notas (opcional)</label><textarea id="m-notas" rows="2" placeholder="ex: empresa, contacto, referência legal">${escapeHtml(m?.notas || '')}</textarea></div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn ghost" id="m-cancel" style="flex:1">Cancelar</button>
          <button class="btn primary" id="m-save" style="flex:1">${isEdit ? 'Guardar' : 'Criar'}</button>
        </div>
      </div>
    </div>`;

  const close = () => { host.innerHTML = ''; };
  host.querySelector('#ov').addEventListener('click', (e) => { if (e.target.id === 'ov') close(); });
  host.querySelector('#m-cancel').addEventListener('click', close);

  // Repetição estilo calendário · chips + resumo ao vivo
  const valorEl = host.querySelector('#m-valor');
  const unidadeEl = host.querySelector('#m-unidade');
  const diaSemEl = host.querySelector('#m-diasemana');
  const resumoEl = host.querySelector('#m-resumo');
  const atualizarResumo = () => { resumoEl.textContent = manut.textoPeriodicidade(valorEl.value, unidadeEl.value, diaSemEl.value); };
  valorEl.addEventListener('input', atualizarResumo);
  unidadeEl.addEventListener('change', atualizarResumo);
  diaSemEl.addEventListener('change', atualizarResumo);
  host.querySelectorAll('.chip-per').forEach(c => c.addEventListener('click', () => {
    valorEl.value = c.dataset.v;
    unidadeEl.value = c.dataset.u;
    atualizarResumo();
  }));
  atualizarResumo();
  // Modelos preenchem tudo
  host.querySelectorAll('.mod-btn').forEach(b => b.addEventListener('click', () => {
    const mod = manut.MODELOS[parseInt(b.dataset.i, 10)];
    host.querySelector('#m-nome').value = mod.nome;
    host.querySelector('#m-cat').value = mod.categoria;
    host.querySelector('#m-valor').value = mod.valor;
    host.querySelector('#m-unidade').value = mod.unidade;
    host.querySelector('#m-aviso').value = mod.diasAviso;
    host.querySelector('#m-notas').value = mod.notas;
  }));

  host.querySelector('#m-save').addEventListener('click', async () => {
    const data = {
      nome: host.querySelector('#m-nome').value,
      categoria: host.querySelector('#m-cat').value,
      dataUltima: host.querySelector('#m-ultima').value,
      periodicidadeValor: host.querySelector('#m-valor').value,
      periodicidadeUnidade: host.querySelector('#m-unidade').value,
      diaSemana: host.querySelector('#m-diasemana').value,
      diasAviso: host.querySelector('#m-aviso').value,
      notas: host.querySelector('#m-notas').value
    };
    try {
      if (isEdit) await manut.atualizar(m.id, data);
      else await manut.criar(data);
      close();
      await renderList();
    } catch (e) { alert('Erro: ' + e.message); }
  });
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
