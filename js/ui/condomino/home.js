/**
 * Página: Menu Principal · Condómino
 *
 * Mostra:
 *  - Saudação e dados da fração
 *  - Tile "Fale com a Administração" com badge de não lidas
 *  - (Mais tiles serão adicionados na Fase 5)
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as comunicacoes from '../../modules/comunicacoes.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

export async function render(container) {
  const session = auth.getSession();
  const tenantName = session?.tenantName || '';
  const fraction = session?.fraction || '';
  const tenantId = session?.tenantId;

  const tenant = tenantId ? await store.getDoc('tenants', tenantId) : null;
  const quotaMensal = tenant?.rentByYear?.['2026'] || 0;

  // Contagem de comunicações não lidas
  const naoLidas = tenantId ? await comunicacoes.contagemNaoLidasCondomino(tenantId) : 0;

  container.innerHTML = `
    <div class="app">
      <header class="header">
        <div class="brand">
          <div class="brand-mark">${icon('logo-mark', 'brand-mark-svg')}</div>
          <div class="brand-text">
            <div class="name">Condomínio AR24</div>
            <div class="sub">Vista do Condómino</div>
          </div>
        </div>
        <div class="header-actions">
          <div class="header-user">
            <div class="hu-name">${tenantName}</div>
            <div class="hu-frac">${fraction}</div>
          </div>
          <button class="btn-hamburger" id="logout-btn" title="Sair">
            <span class="hl"></span><span class="hl"></span><span class="hl"></span>
          </button>
        </div>
      </header>

      <main class="main">
        <div class="home-header">
          <div class="home-greeting">
            <div class="home-hello">Olá,</div>
            <div class="home-name">${tenantName}</div>
            <div class="home-frac">${fraction}</div>
          </div>
        </div>

        <div class="menu-grid">
          <a class="menu-tile span-2" data-route="condomino/comunicacoes">
            <div class="mt-icon-wrap">
              ${icon('ic-payment-out', 'mt-icon')}
              ${naoLidas > 0 ? `<span class="mt-badge">${naoLidas}</span>` : ''}
            </div>
            <div class="mt-name">Fale com a Administração</div>
          </a>
        </div>

        <div class="info-card">
          <div class="info-row">
            <span class="info-lbl">Quota mensal</span>
            <span class="info-val">${formatMoney(quotaMensal)}</span>
          </div>
          <div class="info-row">
            <span class="info-lbl">Permilagem</span>
            <span class="info-val">${tenant?.permilage || 0}‰</span>
          </div>
          <div class="info-row">
            <span class="info-lbl">Email</span>
            <span class="info-val">${tenant?.email || '—'}</span>
          </div>
        </div>

        <div class="placeholder" style="margin-top:18px">
          <p style="font-size:13px;color:var(--text-muted)">
            Restantes secções (estado de quotas, situação bancária, recibos) serão disponibilizadas na Fase 5.
          </p>
          <button class="btn-cta" id="logout-cta">Terminar Sessão</button>
        </div>
      </main>
    </div>
  `;

  const doLogout = () => { auth.logout(); router.navigate('login'); };
  container.querySelector('#logout-btn').addEventListener('click', doLogout);
  container.querySelector('#logout-cta').addEventListener('click', doLogout);

  // Navegação por data-route
  container.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      router.navigate(el.dataset.route);
    });
  });
}
