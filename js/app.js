/**
 * App bootstrap. Inicializa store, auth, router e regista todas as rotas.
 *
 * Versão de teste · localStorage. Para migrar para Firebase no futuro:
 *  1. Substituir imports de `./store/local-store.js` → `./store/firestore-store.js`
 *  2. Substituir `./auth/local-auth.js` → `./auth/firebase-auth.js`
 *  3. Manter o resto da app intocado (mesma API).
 */

import * as auth from './auth/local-auth.js';
import * as router from './ui/router.js';
import { seedIfEmpty } from './store/seed-data.js';
import { mountIconSprite } from './ui/icons.js';
import { makePlaceholder } from './ui/placeholder.js';

import * as loginPage from './ui/login.js';
import * as adminHome from './ui/admin/home.js';
import * as adminRecibos from './ui/admin/recibos.js';
import * as adminQuotas from './ui/admin/quotas.js';
import * as adminBanco from './ui/admin/banco.js';
import * as adminDespesas from './ui/admin/despesas.js';
import * as adminRubricas from './ui/admin/rubricas.js';
import * as adminPlanos from './ui/admin/planos.js';
import * as adminComunicacoes from './ui/admin/comunicacoes.js';
import * as adminUtilizadores from './ui/admin/utilizadores.js';
import * as condominoHome from './ui/condomino/home.js';
import * as condominoComunicacoes from './ui/condomino/comunicacoes.js';

// ─── Bootstrap ────────────────────────────────────────────

async function main() {
  console.log('[app] Gestão do Condomínio AR24 · v0.1.0-teste');
  console.log('[app] Modo: localStorage (versão de teste, sem cloud)');

  // 1. Montar SVG sprite (ícones disponíveis para toda a app)
  mountIconSprite();

  // 2. Seed inicial (se ainda não houver dados)
  await seedIfEmpty();

  // 3. Inicializar auth
  await auth.initAuth();

  // 4. Registar rotas
  router.register('login', loginPage);
  router.register('admin/home', adminHome, { requiresAuth: 'admin' });
  router.register('condomino/home', condominoHome, { requiresAuth: 'condomino' });

  // Rotas reais (Fase 2 + 3a + 4 · comunicações)
  router.register('admin/recibos',         adminRecibos,         { requiresAuth: 'admin' });
  router.register('admin/quotas',          adminQuotas,          { requiresAuth: 'admin' });
  router.register('admin/banco',           adminBanco,           { requiresAuth: 'admin' });
  router.register('admin/despesas',        adminDespesas,        { requiresAuth: 'admin' });
  router.register('admin/rubricas',        adminRubricas,        { requiresAuth: 'admin' });
  router.register('admin/planos',          adminPlanos,          { requiresAuth: 'admin' });
  router.register('admin/comunicacoes',    adminComunicacoes,    { requiresAuth: 'admin' });
  router.register('admin/utilizadores',    adminUtilizadores,    { requiresAuth: 'admin' });
  router.register('admin/consultar',       adminRecibos,         { requiresAuth: 'admin' });  // alias

  router.register('condomino/comunicacoes', condominoComunicacoes, { requiresAuth: 'condomino' });

  // Rotas placeholder (a implementar nas próximas fases)
  router.register('admin/quotas-nova',  makePlaceholder('Inserir Quota', 'Modal · Registar Pagamento'), { requiresAuth: 'admin' });
  router.register('admin/despesa-nova', makePlaceholder('Inserir Pagamento', 'Despesa do condomínio'),  { requiresAuth: 'admin' });
  router.register('admin/analise',      makePlaceholder('Análise', 'Gráficos e indicadores'),           { requiresAuth: 'admin' });
  router.register('admin/config',       makePlaceholder('Definições', 'Configurações da app'),          { requiresAuth: 'admin' });

  // 5. Rota inicial
  // Se há hash na URL e está autenticado, vai para esse hash; senão para login.
  const hash = window.location.hash.slice(1);
  if (hash && auth.isAuthenticated()) {
    router.navigate(hash);
  } else {
    router.routeByAuthState();
  }

  // 6. Reagir a mudanças de auth (logout, etc.)
  auth.onAuthChange((session) => {
    if (!session && router.getCurrentRoute() !== 'login') {
      router.navigate('login');
    }
  });
}

// Arrancar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

// ─── Registar Service Worker (PWA installable) ───────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[app] Service Worker registado, scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[app] Service Worker não registou:', err);
      });
  });
}

// Error handler global
window.addEventListener('error', (e) => {
  console.error('[app] erro global:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[app] promise rejeitada:', e.reason);
});
