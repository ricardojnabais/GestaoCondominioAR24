/**
 * Gestão de Utilizadores (condóminos).
 *
 * Permite ao admin:
 *  - Criar conta para um condómino (se tem email)
 *  - Repor password (volta a NIF + flag passwordPrecisaReset)
 *  - Desativar / reativar conta
 *  - Ver último login
 *
 * Notas:
 *  - Os IDs dos users são `user_${tenantId}` (1:1 com tenant)
 *  - Password armazenada em claro nesta versão de teste · em Firebase passa
 *    a usar Firebase Auth (sem armazenamento de password no nosso lado)
 */

import * as store from '../store/local-store.js';

/**
 * Listar todos os tenants com estado da conta (criada/sem conta).
 */
export async function listarUtilizadores() {
  const tenants = await store.listDocs('tenants');
  const users = await store.listDocs('users');
  const userByTenantId = {};
  for (const u of users) {
    if (u.tenantId) userByTenantId[u.tenantId] = u;
  }

  tenants.sort((a, b) => (a.fraction || '').localeCompare(b.fraction || ''));
  return tenants.map(t => ({
    tenant: t,
    user: userByTenantId[t.id] || null
  }));
}

/**
 * Criar conta para um condómino.
 * Requer que o tenant tenha email definido.
 */
export async function criarConta(tenantId, operatorName) {
  const tenant = await store.getDoc('tenants', tenantId);
  if (!tenant) throw new Error('Condómino não encontrado.');
  if (!tenant.email?.trim()) {
    throw new Error('O condómino não tem email definido. Adiciona um email primeiro.');
  }

  const existing = await store.queryDocs('users', { tenantId });
  if (existing.length > 0) {
    throw new Error('Já existe uma conta para este condómino.');
  }

  const doc = {
    id: `user_${tenantId}`,
    email: tenant.email.trim().toLowerCase(),
    password: tenant.nif,           // password inicial = NIF
    passwordPrecisaReset: true,
    tenantId,
    tenantName: tenant.name,
    fraction: tenant.fraction,
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    disabled: false,
    lastLogin: null
  };
  return await store.setDoc('users', doc);
}

/**
 * Repor password para o NIF do tenant.
 * Marca como precisa-reset no próximo login.
 */
export async function reporPassword(userId, operatorName) {
  const u = await store.getDoc('users', userId);
  if (!u) throw new Error('Utilizador não encontrado.');
  const t = await store.getDoc('tenants', u.tenantId);
  if (!t) throw new Error('Condómino associado não encontrado.');

  u.password = t.nif;
  u.passwordPrecisaReset = true;
  u.passwordResetEm = Date.now();
  u.passwordResetPor = operatorName || null;
  return await store.setDoc('users', u);
}

/**
 * Definir password manual (admin escolhe).
 */
export async function definirPassword(userId, novaPassword, operatorName) {
  if (!novaPassword || novaPassword.length < 4) {
    throw new Error('Password tem de ter pelo menos 4 caracteres.');
  }
  const u = await store.getDoc('users', userId);
  if (!u) throw new Error('Utilizador não encontrado.');
  u.password = novaPassword;
  u.passwordPrecisaReset = false;
  u.passwordResetEm = Date.now();
  u.passwordResetPor = operatorName || null;
  return await store.setDoc('users', u);
}

/**
 * Desativar conta (impede login).
 */
export async function desativar(userId, operatorName) {
  const u = await store.getDoc('users', userId);
  if (!u) throw new Error('Utilizador não encontrado.');
  u.disabled = true;
  u.disabledEm = Date.now();
  u.disabledPor = operatorName || null;
  return await store.setDoc('users', u);
}

/**
 * Reativar conta.
 */
export async function reactivar(userId) {
  const u = await store.getDoc('users', userId);
  if (!u) throw new Error('Utilizador não encontrado.');
  u.disabled = false;
  u.disabledEm = null;
  u.disabledPor = null;
  return await store.setDoc('users', u);
}
