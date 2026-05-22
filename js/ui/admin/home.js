/**
 * Página: Menu Principal · Admin
 */

import * as auth from '../../auth/local-auth.js';
import * as store from '../../store/local-store.js';
import * as router from '../router.js';
import * as saldoBanco from '../../modules/saldo-banco.js';
import * as modalRP from '../modal-registar-pagamento.js';
import { icon } from '../icons.js';
import { formatMoney } from '../../utils/format.js';

export async function render(container) {
  const session = auth.getSession();
  const operatorName = session?.operatorName || 'Operador';

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
          <button class="btn-hamburger" id="hamburger" title="Menu">
            <span class="hl"></span><span class="hl"></span><span class="hl"></span>
          </button>
        </div>
      </header>

      <main class="main">
        <div class="home-header">
          <div class="home-greeting">
            <div class="home-hello">Olá,</div>
            <div class="home-name">${operatorName}</div>
          </div>
          <div class="home-snap">
            <div class="snap-lbl">Saldo Bancário</div>
            <div class="snap-val" id="saldo-snap">…</div>
          </div>
        </div>

        <div class="menu-tiles">
          <a class="menu-tile" data-action="registar-pagamento">
            <div class="mt-icon-wrap">${icon('ic-quota-in', 'mt-icon')}</div>
            <div class="mt-name">Inserir Quota</div>
          </a>
          <a class="menu-tile" data-route="admin/recibos">
            <div class="mt-icon-wrap">${icon('ic-receipt', 'mt-icon')}</div>
            <div class="mt-name">Enviar Recibo</div>
          </a>
          <a class="menu-tile" data-route="admin/despesa-nova">
            <div class="mt-icon-wrap">${icon('ic-payment-out', 'mt-icon')}</div>
            <div class="mt-name">Inserir Pagamento</div>
          </a>
          <a class="menu-tile" data-route="admin/consultar">
            <div class="mt-icon-wrap">${icon('ic-search-list', 'mt-icon')}</div>
            <div class="mt-name">Consultar Pagamentos</div>
          </a>
          <a class="menu-tile" data-route="admin/banco">
            <div class="mt-icon-wrap">${icon('ic-bank', 'mt-icon')}</div>
            <div class="mt-name">Situação Bancária</div>
          </a>
          <a class="menu-tile" data-route="admin/analise">
            <div class="mt-icon-wrap">${icon('ic-dashboard', 'mt-icon')}</div>
            <div class="mt-name">Análise</div>
          </a>
          <a class="menu-tile span-2" data-route="admin/config">
            <div class="mt-icon-wrap">${icon('ic-settings', 'mt-icon')}</div>
            <div class="mt-name">Definições</div>
          </a>
        </div>
      </main>
    </div>
  `;

  await refreshSaldo(container);

  container.querySelectorAll('.menu-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const route = tile.dataset.route;
      const action = tile.dataset.action;

      if (action === 'registar-pagamento') {
        modalRP.open({
          onSuccess: () => refreshSaldo(container)
        });
        return;
      }
      if (route) router.navigate(route);
    });
  });

  container.querySelector('#hamburger').addEventListener('click', () => {
    if (confirm('Terminar sessão?')) {
      auth.logout();
      router.navigate('login');
    }
  });

  container.querySelector('#brand').addEventListener('click', () => {
    router.navigate('admin/home');
  });
}

async function refreshSaldo(container) {
  const year = new Date().getFullYear().toString();
  const { saldo } = await saldoBanco.calcularSaldo(year);
  const el = container.querySelector('#saldo-snap');
  if (el) el.textContent = formatMoney(saldo);
}
