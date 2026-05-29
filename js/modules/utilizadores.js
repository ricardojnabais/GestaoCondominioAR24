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
import { hashPassword } from '../auth/password-hash.js';

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
 * Password inicial = NIF · guardada como hash PBKDF2.
 */
export async function criarConta(tenantId, operatorName) {
  const tenant = await store.getDoc('tenants', tenantId);
  if (!tenant) throw new Error('Condómino não encontrado.');
  if (!tenant.email?.trim()) {
    throw new Error('O condómino não tem email definido. Adiciona um email primeiro.');
  }
  if (!tenant.nif) {
    throw new Error('O condómino não tem NIF definido (necessário como password inicial).');
  }

  const existing = await store.queryDocs('users', { tenantId });
  if (existing.length > 0) {
    throw new Error('Já existe uma conta para este condómino.');
  }

  const { hash, salt, algo } = await hashPassword(String(tenant.nif));

  const doc = {
    id: `user_${tenantId}`,
    email: tenant.email.trim().toLowerCase(),
    passwordHash: hash,
    passwordSalt: salt,
    passwordAlgo: algo,
    passwordPrecisaReset: true,
    tenantId,
    tenantName: tenant.name,
    fraction: tenant.fraction,
    criadoEm: Date.now(),
    criadoPor: operatorName || null,
    disabled: false,
    lastLogin: null
  };
  await store.setDoc('users', doc);
  // Retorna password só na resposta para a UI mostrar uma vez · NÃO guardada
  return { ...doc, password: String(tenant.nif) };
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
  if (!t.nif) throw new Error('Condómino não tem NIF definido.');

  const { hash, salt, algo } = await hashPassword(String(t.nif));
  u.passwordHash = hash;
  u.passwordSalt = salt;
  u.passwordAlgo = algo;
  delete u.password;       // limpar legacy texto plano se existia
  delete u.passwordPlain;  // garantir limpeza
  u.passwordPrecisaReset = true;
  u.passwordResetEm = Date.now();
  u.passwordResetPor = operatorName || null;
  await store.setDoc('users', u);
  return { ...u, password: String(t.nif) }; // só para a UI mostrar
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

  const { hash, salt, algo } = await hashPassword(novaPassword);
  u.passwordHash = hash;
  u.passwordSalt = salt;
  u.passwordAlgo = algo;
  delete u.password;
  delete u.passwordPlain;
  u.passwordPrecisaReset = false;
  u.passwordResetEm = Date.now();
  u.passwordResetPor = operatorName || null;
  await store.setDoc('users', u);
  return { ...u, password: novaPassword }; // só para a UI mostrar
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

/**
 * Migração em massa · converte passwords em texto plano (legacy) para hash PBKDF2.
 *
 * Útil quando se sobe a v1.0.26 e há contas antigas com `password` em texto plano.
 * Operação idempotente: contas que já têm `passwordHash` são ignoradas.
 *
 * @param {function} onProgress - callback({total, hashed, skipped, current})
 * @returns {Promise<{total, hashed, skipped}>}
 */
export async function migrarPasswordsParaHash(onProgress = () => {}) {
  const users = await store.listDocs('users');
  let hashed = 0;
  let skipped = 0;

  for (const u of users) {
    if (u.passwordHash && u.passwordSalt) {
      skipped++;
      onProgress({ total: users.length, hashed, skipped, current: u.email, status: 'skip' });
      continue;
    }
    if (!u.password) {
      // Sem password legacy nem hash · ignora
      skipped++;
      onProgress({ total: users.length, hashed, skipped, current: u.email, status: 'no-password' });
      continue;
    }
    const { hash, salt, algo } = await hashPassword(String(u.password));
    u.passwordHash = hash;
    u.passwordSalt = salt;
    u.passwordAlgo = algo;
    delete u.password;
    delete u.passwordPlain;
    u.passwordMigradoEm = Date.now();
    await store.setDoc('users', u);
    hashed++;
    onProgress({ total: users.length, hashed, skipped, current: u.email, status: 'migrated' });
  }

  return { total: users.length, hashed, skipped };
}
