/**
 * Página: Menu Principal · Condómino
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import { icon } from '../icons.js';

export async function render(container) {
  const session = auth.getSession();
  const tenantName = session?.tenantName || '';
  const fraction = session?.fraction || '';
  const tenantId = session?.tenantId;

  // Calcular estado pessoal
  const tenant = tenantId ? await store.getDoc('tenants', tenantId) : null;
  const quotaMensal = tenant?.rentByYear?.['2026'] || 0;

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

        <div class="placeholder">
          <h3>Versão de teste em construção</h3>
          <p>
            Login do condómino está a funcionar.<br>
            Quota mensal: <strong>${(quotaMensal/100).toFixed(2)} €</strong><br>
            Permilagem: <strong>${tenant?.permilage || 0}‰</strong>
          </p>
          <button class="btn-cta" id="logout-cta">Terminar Sessão</button>
        </div>
      </main>
    </div>
  `;

  const doLogout = () => { auth.logout(); router.navigate('login'); };
  container.querySelector('#logout-btn').addEventListener('click', doLogout);
  container.querySelector('#logout-cta').addEventListener('click', doLogout);
}
