/**
 * Página: Rúbricas · Admin
 * Gerir categorias de despesa. Criar, terminar, reativar.
 */

import * as rubricas from '../../modules/rubricas.js';
import * as auth from '../../auth/local-auth.js';
import * as router from '../router.js';
import { icon } from '../icons.js';
import { formatDate } from '../../utils/format.js';

let containerRef = null;
let filtro = 'ativas'; // 'ativas' | 'inativas' | 'todas'

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
              <div class="breadcrumb">Categorias de Despesa</div>
              <h1>Rúbricas</h1>
            </div>
            <button class="btn primary" id="btn-new" style="margin-left:auto">+ Nova rúbrica</button>
          </div>
        </div>

        <div class="filters">
          <div class="filter-group">
            <label>Mostrar</label>
            <select id="f-estado">
              <option value="ativas">Ativas</option>
              <option value="inativas">Inativas</option>
              <option value="todas">Todas</option>
            </select>
          </div>
        </div>

        <div id="rubs-list"></div>
      </main>
    </div>
  `;

  await renderList();

  container.querySelector('#brand').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#back-home').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#hamburger').addEventListener('click', () => router.navigate('admin/home'));
  container.querySelector('#f-estado').addEventListener('change', (e) => {
    filtro = e.target.value;
    renderList();
  });
  container.querySelector('#btn-new').addEventListener('click', criarNova);
}

async function renderList() {
  const all = await rubricas.listar();
  let list;
  if (filtro === 'ativas') list = all.filter(r => !r.terminadaEm);
  else if (filtro === 'inativas') list = all.filter(r => r.terminadaEm);
  else list = all;

  const el = containerRef.querySelector('#rubs-list');
  if (list.length === 0) {
    el.innerHTML = `
      <div class="placeholder">
        <h3>Sem rúbricas ${filtro === 'todas' ? '' : filtro}</h3>
        <p>${filtro === 'inativas' ? 'Não há rúbricas inativas.' : 'Cria a primeira com "+ Nova rúbrica".'}</p>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="rub-list">${list.map(buildRow).join('')}</div>`;

  containerRef.querySelectorAll('[data-action="terminar"]').forEach(elm => {
    elm.addEventListener('click', () => terminarRubrica(elm.dataset.id));
  });
  containerRef.querySelectorAll('[data-action="reactivar"]').forEach(elm => {
    elm.addEventListener('click', () => reativarRubrica(elm.dataset.id));
  });
}

function fmtTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : formatDate(d.toISOString().slice(0, 10));
}

function buildRow(r) {
  const isAtiva = !r.terminadaEm;
  const createdAt = fmtTs(r.criadaEm);
  const endedAt = fmtTs(r.terminadaEm);
  const meta = [
    createdAt ? `Criada em ${createdAt}${r.criadaPor ? ` por ${r.criadaPor}` : ''}` : '',
    endedAt ? `Inativa desde ${endedAt}` : ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="rub-item ${isAtiva ? 'active' : 'terminated'}">
      <div class="rub-info">
        <div class="rub-name-main">${escapeHtml(r.nome)}
          <span style="font-size:11px;font-weight:700;color:#fff;background:${isAtiva ? '#1e8449' : '#8a93a0'};padding:2px 8px;border-radius:10px;margin-left:6px">${isAtiva ? 'Ativa' : 'Inativa'}</span>
        </div>
        ${meta ? `<div class="rub-meta">${meta}</div>` : ''}
      </div>
      <div class="rub-actions">
        ${isAtiva
          ? `<button class="btn danger" data-action="terminar" data-id="${r.id}">Desativar</button>`
          : `<button class="btn" data-action="reactivar" data-id="${r.id}">Ativar</button>`}
      </div>
    </div>
  `;
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function criarNova() {
  const nome = prompt('Nome da nova rúbrica:');
  if (!nome || !nome.trim()) return;
  try {
    const session = auth.getSession();
    await rubricas.criar({ nome: nome.trim() }, session?.operatorName);
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function terminarRubrica(id) {
  if (!confirm('Desativar esta rúbrica? Não desaparece nem afeta despesas históricas — apenas deixa de estar disponível para novas despesas e some das ativas.')) return;
  try {
    const session = auth.getSession();
    await rubricas.terminar(id, session?.operatorName);
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function reativarRubrica(id) {
  if (!confirm('Ativar esta rúbrica? Volta a ficar disponível para novas despesas.')) return;
  try {
    await rubricas.reactivar(id);
    renderList();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}
