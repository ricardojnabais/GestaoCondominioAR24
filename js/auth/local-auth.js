/**
 * LocalAuth · autenticação simulada usando localStorage.
 *
 * Simula o comportamento do Firebase Auth para a versão de teste.
 * API desenhada para ser substituível por Firebase Auth diretamente.
 *
 * Estados possíveis:
 *  - admin:    operador autenticado pela "conta partilhada" (qualquer um dos 2 admins)
 *  - condomino: condómino autenticado pelo seu email + password
 *  - null:     sem sessão
 *
 * NOTA DE SEGURANÇA: as passwords são guardadas em CLARO no localStorage.
 * Isto é aceitável para a versão de TESTE (dados ficam no browser do utilizador).
 * Em produção (Firebase), o Firebase Auth trata da encriptação automaticamente.
 */

import * as store from '../store/local-store.js';

const SESSION_KEY = 'ar24:session';

let currentSession = null;
const sessionListeners = new Set();

// ─── inicialização ────────────────────────────────────────

/**
 * Carrega sessão guardada (se existir) e notifica listeners.
 */
export async function initAuth() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      currentSession = JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
  notifyListeners();
}

// ─── login admin ──────────────────────────────────────────

/**
 * Simula Google OAuth: na versão de teste, dá login direto + seleção de operador.
 * @param {string} operatorName - nome do operador (Ricardo ou Filipe)
 */
export async function loginAdmin(operatorName) {
  const meta = await store.getDoc('meta', 'config');
  if (!meta || !meta.administracao.nomes.includes(operatorName)) {
    throw new Error(`Operador "${operatorName}" não autorizado.`);
  }
  setSession({
    role: 'admin',
    operatorName,
    email: meta.administracao.emailContaCondominio,
    loginAt: Date.now()
  });
}

// ─── login condómino ──────────────────────────────────────

/**
 * Login do condómino com email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} - sessão criada
 */
export async function loginCondomino(email, password) {
  const users = await store.queryDocs('users', { email: email.trim().toLowerCase() });
  if (users.length === 0) {
    throw new Error('Email não registado. Pede ao administrador para criar a tua conta.');
  }
  const user = users[0];
  if (user.password !== password) {
    throw new Error('Password incorreta.');
  }
  if (user.disabled) {
    throw new Error('Conta desativada. Contacta o administrador.');
  }

  // Lookup do tenant correspondente
  const tenants = await store.queryDocs('tenants', { email });
  if (tenants.length === 0) {
    throw new Error('Email não corresponde a nenhuma fração registada.');
  }
  const tenant = tenants[0];

  // Update last login
  user.lastLogin = Date.now();
  await store.setDoc('users', user);

  setSession({
    role: 'condomino',
    userId: user.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    fraction: tenant.fraction,
    email,
    mustChangePassword: !!user.mustChangePassword,
    loginAt: Date.now()
  });
}

// ─── criação de utilizador (pelo admin) ───────────────────

/**
 * Cria conta de condómino. Só chamável quando admin está autenticado.
 * @param {string} email
 * @param {string} tempPassword - password temporária (condómino muda no 1.º acesso)
 */
export async function createUser(email, tempPassword) {
  if (currentSession?.role !== 'admin') {
    throw new Error('Apenas o administrador pode criar contas.');
  }
  email = email.trim().toLowerCase();
  if (!email || !tempPassword) throw new Error('Email e password obrigatórios.');

  // Validar que email corresponde a um condómino
  const tenants = await store.queryDocs('tenants', { email });
  if (tenants.length === 0) {
    throw new Error(`Email "${email}" não corresponde a nenhuma fração registada.`);
  }

  // Verificar se já existe
  const existing = await store.queryDocs('users', { email });
  if (existing.length > 0) {
    throw new Error(`Já existe uma conta para "${email}".`);
  }

  const user = {
    email,
    password: tempPassword,
    role: 'condomino',
    tenantId: tenants[0].id,
    createdAt: Date.now(),
    createdBy: currentSession.operatorName,
    mustChangePassword: true,
    disabled: false
  };
  await store.setDoc('users', user);
  return user;
}

/**
 * Reset de password (admin envia password temporária ao condómino).
 */
export async function resetPassword(email, newTempPassword) {
  if (currentSession?.role !== 'admin') {
    throw new Error('Apenas o administrador pode fazer reset.');
  }
  const users = await store.queryDocs('users', { email: email.trim().toLowerCase() });
  if (users.length === 0) throw new Error('Utilizador não encontrado.');
  const user = users[0];
  user.password = newTempPassword;
  user.mustChangePassword = true;
  user.passwordResetAt = Date.now();
  user.passwordResetBy = currentSession.operatorName;
  await store.setDoc('users', user);
}

/**
 * Apaga conta de condómino (admin).
 */
export async function deleteUser(email) {
  if (currentSession?.role !== 'admin') {
    throw new Error('Apenas o administrador pode apagar contas.');
  }
  const users = await store.queryDocs('users', { email: email.trim().toLowerCase() });
  if (users.length === 0) throw new Error('Utilizador não encontrado.');
  await store.deleteDoc('users', users[0].id);
}

/**
 * Condómino muda a sua própria password.
 */
export async function changeOwnPassword(currentPassword, newPassword) {
  if (currentSession?.role !== 'condomino') {
    throw new Error('Acessível apenas a condóminos autenticados.');
  }
  const user = await store.getDoc('users', currentSession.userId);
  if (!user || user.password !== currentPassword) {
    throw new Error('Password atual incorreta.');
  }
  user.password = newPassword;
  user.mustChangePassword = false;
  user.passwordChangedAt = Date.now();
  await store.setDoc('users', user);
  currentSession.mustChangePassword = false;
  saveSession();
}

// ─── logout ───────────────────────────────────────────────

export function logout() {
  currentSession = null;
  sessionStorage.removeItem(SESSION_KEY);
  notifyListeners();
}

// ─── sessão atual ─────────────────────────────────────────

export function getSession() {
  return currentSession;
}

export function isAdmin() {
  return currentSession?.role === 'admin';
}

export function isCondomino() {
  return currentSession?.role === 'condomino';
}

export function isAuthenticated() {
  return !!currentSession;
}

// ─── listeners ────────────────────────────────────────────

export function onAuthChange(callback) {
  sessionListeners.add(callback);
  callback(currentSession);  // chama com estado atual
  return () => sessionListeners.delete(callback);
}

// ─── internos ─────────────────────────────────────────────

function setSession(session) {
  currentSession = session;
  saveSession();
  notifyListeners();
}

function saveSession() {
  if (currentSession) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

function notifyListeners() {
  sessionListeners.forEach(cb => {
    try { cb(currentSession); } catch (e) { console.error('[auth] listener erro:', e); }
  });
}

// Debug helper
if (typeof window !== 'undefined') {
  window.__auth = { getSession, isAdmin, isCondomino, logout };
}
