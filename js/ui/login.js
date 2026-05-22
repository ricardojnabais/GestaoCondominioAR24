/**
 * Página de Login · admin (operator selection) e condómino (email/password)
 */

import * as auth from '../auth/local-auth.js';
import * as store from '../store/local-store.js';
import * as router from './router.js';
import { icon } from './icons.js';

export async function render(container) {
  const meta = await store.getDoc('meta', 'config');
  const adminNames = meta?.administracao?.nomes || ['Ricardo Nabais', 'Filipe Solha'];

  container.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="login-mark">${icon('logo-full', 'login-mark-svg')}</div>
        <div class="login-sub">Av. Amália Rodrigues, 24 · Amadora</div>
        <div class="login-title">Gestão do Condomínio</div>
        <div class="login-desc">Escolhe como queres entrar</div>

        <div class="login-tabs">
          <button class="login-tab active" data-tab="admin">
            ${icon('ic-settings', 'lt-icon')}
            <span>Administrador</span>
          </button>
          <button class="login-tab" data-tab="condomino">
            ${icon('ic-home', 'lt-icon')}
            <span>Condómino</span>
          </button>
        </div>

        <div id="login-admin-form">
          <p class="login-method-info">
            Vista de teste · escolhe o operador
          </p>
          <div class="field">
            <label>Operador</label>
            <select id="admin-operator">
              ${adminNames.map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <button class="btn-google" id="btn-login-admin">Entrar como Administrador</button>
        </div>

        <div id="login-condomino-form" style="display:none">
          <p class="login-method-info">Entrada com email e password</p>
          <div class="field">
            <label>Email</label>
            <input type="email" id="cond-email" placeholder="o.teu.email@exemplo.pt" autocomplete="email">
          </div>
          <div class="field">
            <label>Password</label>
            <input type="password" id="cond-password" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button class="btn-google" id="btn-login-condomino">Entrar</button>
          <button class="login-link" id="link-forgot">Esqueci-me da password</button>
        </div>

        <div id="login-error" style="margin-top:12px;color:var(--red);font-size:13px;text-align:center;display:none"></div>

        <div class="login-foot">Versão de teste · 10 frações · 2 administradores</div>
      </div>
    </div>
  `;

  // Tab switching
  container.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.tab;
      container.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector('#login-admin-form').style.display = mode === 'admin' ? 'block' : 'none';
      container.querySelector('#login-condomino-form').style.display = mode === 'condomino' ? 'block' : 'none';
      clearError();
    });
  });

  // Admin login
  container.querySelector('#btn-login-admin').addEventListener('click', async () => {
    clearError();
    const op = container.querySelector('#admin-operator').value;
    try {
      await auth.loginAdmin(op);
      router.navigate('admin/home');
    } catch (e) {
      showError(e.message);
    }
  });

  // Condómino login
  container.querySelector('#btn-login-condomino').addEventListener('click', async () => {
    clearError();
    const email = container.querySelector('#cond-email').value;
    const password = container.querySelector('#cond-password').value;
    try {
      await auth.loginCondomino(email, password);
      router.navigate('condomino/home');
    } catch (e) {
      showError(e.message);
    }
  });

  container.querySelector('#link-forgot').addEventListener('click', () => {
    alert('Pede ao administrador para fazer reset à tua password.');
  });

  function showError(msg) {
    const el = container.querySelector('#login-error');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function clearError() {
    container.querySelector('#login-error').style.display = 'none';
  }
}
