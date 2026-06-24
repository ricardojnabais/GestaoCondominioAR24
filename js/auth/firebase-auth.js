/**
 * Firebase Auth · Admin Sign-In via Google OAuth
 *
 * Workflow:
 *  1. signInAdmin() · abre popup Google · validação email contra whitelist
 *  2. Após login Google bem-sucedido, retorna user
 *  3. App pede ao utilizador para seleccionar operador (Ricardo | Filipe)
 *  4. selectOperator() · grava operador em sessionStorage
 *  5. signOutAdmin() · termina sessão Firebase
 *
 * Whitelist é definida em `meta.config.administracao.emailsAutorizados`.
 */

// Conta partilhada que pode entrar como admin
const ADMIN_EMAILS_FALLBACK = ['condoamira24@gmail.com'];

async function getAllowedEmails() {
  try {
    const store = await import('../store/local-store.js');
    const config = await store.getDoc('meta', 'config');
    const lista = config?.administracao?.emailsAutorizados;
    if (Array.isArray(lista) && lista.length > 0) return lista.map(e => e.toLowerCase());
  } catch (e) { /* fallback */ }
  return ADMIN_EMAILS_FALLBACK;
}

export function isFirebaseAvailable() {
  return !!(window.__firebase?.auth && window.__firebase?.authFns);
}

export function currentFirebaseUser() {
  return window.__firebase?.auth?.currentUser || null;
}

/**
 * Abrir popup Google Sign-In. Valida email contra whitelist.
 * Em iOS Safari standalone, popup pode não funcionar · usa redirect como fallback.
 */
export async function signInAdmin() {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase Auth não disponível · configura firebase-config.js');
  }
  const { auth, authFns } = window.__firebase;
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = authFns;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let user;
  try {
    const result = await signInWithPopup(auth, provider);
    user = result.user;
  } catch (err) {
    // Popup bloqueado · fallback para redirect
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      console.warn('[FirebaseAuth] Popup falhou · a tentar redirect:', err.code);
      await signInWithRedirect(auth, provider);
      return null; // a página recarrega · resultado vem em getRedirectResult
    }
    throw err;
  }

  return await validateAndSetup(user);
}

/**
 * Após signInWithRedirect, chamar isto no boot para apanhar o resultado.
 */
export async function checkRedirectResult() {
  if (!isFirebaseAvailable()) return null;
  const { auth, authFns } = window.__firebase;
  try {
    const result = await authFns.getRedirectResult(auth);
    if (result?.user) return await validateAndSetup(result.user);
  } catch (e) {
    console.warn('[FirebaseAuth] getRedirectResult:', e);
  }
  return null;
}

async function validateAndSetup(user) {
  const email = (user.email || '').toLowerCase();
  const allowed = await getAllowedEmails();
  if (!allowed.includes(email)) {
    await signOutAdmin();
    throw new Error(`Email ${email} não está autorizado como administrador.\n\nAdministradores autorizados: ${allowed.join(', ')}`);
  }
  return {
    uid: user.uid,
    email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || ''
  };
}

export async function signOutAdmin() {
  if (!isFirebaseAvailable()) return;
  const { auth, authFns } = window.__firebase;
  try { await authFns.signOut(auth); } catch (e) { console.warn(e); }
}

// ─── Bloco 1 · LOGIN DO CONDÓMINO (email/password via Firebase Auth) ──────

/**
 * Login do condómino por email + password usando Firebase Auth.
 * A conta foi criada pelo setup-auth.js (password inicial = NIF) e tem
 * custom claims { role:'condomino', tenantId }.
 *
 * Devolve os dados necessários para criar a sessão local. NÃO cria a sessão
 * aqui · isso é feito no local-auth.js (loginCondominoFirebase), para manter
 * toda a gestão de sessão num só sítio.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{uid, email, tenantId, role, mustChangePassword}>}
 */
export async function signInCondomino(email, password) {
  if (!isFirebaseAvailable()) {
    throw new Error('Firebase Auth não disponível · configura firebase-config.js');
  }
  const { auth, authFns } = window.__firebase;
  const e = (email || '').trim().toLowerCase();
  const p = String(password || '');

  if (!e || !p) throw new Error('Indica o email e a password.');

  let cred;
  try {
    cred = await authFns.signInWithEmailAndPassword(auth, e, p);
  } catch (err) {
    // Traduzir os erros mais comuns do Firebase para mensagens claras
    const code = err?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      throw new Error('Email ou password incorretos.');
    }
    if (code === 'auth/invalid-email') throw new Error('Email inválido.');
    if (code === 'auth/user-disabled') throw new Error('Conta desativada. Contacta o administrador.');
    if (code === 'auth/too-many-requests') throw new Error('Demasiadas tentativas. Tenta novamente mais tarde.');
    throw new Error(err?.message || 'Falha no login.');
  }

  const user = cred.user;

  // Ler os custom claims (tenantId, role) do token.
  // forceRefresh=true garante que apanhamos claims acabados de definir pelo script.
  const tokenResult = await user.getIdTokenResult(true);
  const claims = tokenResult.claims || {};
  const tenantId = claims.tenantId || null;
  const role = claims.role || null;

  if (role !== 'condomino' || !tenantId) {
    // A conta existe mas não tem o claim de condómino · não deve entrar pelo portal
    await signOutAdmin();
    throw new Error('Esta conta não está configurada como condómino. Contacta o administrador.');
  }

  return {
    uid: user.uid,
    email: e,
    tenantId,
    role
  };
}

/**
 * Condómino muda a própria password (Firebase Auth).
 * Requer reautenticação com a password atual (regra de segurança do Firebase
 * para operações sensíveis).
 *
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changeCondominoPassword(currentPassword, newPassword) {
  if (!isFirebaseAvailable()) throw new Error('Firebase Auth não disponível.');
  const { auth, authFns } = window.__firebase;
  const user = auth.currentUser;
  if (!user) throw new Error('Sessão Firebase expirada · volta a entrar.');
  if (!newPassword || newPassword.length < 6) {
    throw new Error('A nova password tem de ter pelo menos 6 caracteres.');
  }

  // Reautenticar com a password atual
  try {
    const credential = authFns.EmailAuthProvider.credential(user.email, currentPassword);
    await authFns.reauthenticateWithCredential(user, credential);
  } catch (err) {
    throw new Error('Password atual incorreta.');
  }

  await authFns.updatePassword(user, newPassword);
}

/**
 * Envia email de recuperação de password (Firebase Auth).
 * Só funciona para emails reais (o João Vaz, sem conta, não se aplica).
 * @param {string} email
 */
export async function sendCondominoPasswordReset(email) {
  if (!isFirebaseAvailable()) throw new Error('Firebase Auth não disponível.');
  const { auth, authFns } = window.__firebase;
  const e = (email || '').trim().toLowerCase();
  if (!e) throw new Error('Indica o teu email.');
  await authFns.sendPasswordResetEmail(auth, e);
}

export function onAuthStateChanged(cb) {
  if (!isFirebaseAvailable()) {
    cb(null);
    return () => {};
  }
  const { auth, authFns } = window.__firebase;
  return authFns.onAuthStateChanged(auth, cb);
}
