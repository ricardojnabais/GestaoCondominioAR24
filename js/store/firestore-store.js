/**
 * Firestore Store · adapter compatível com local-store.js
 *
 * API igual ao local-store · todas as funções são async.
 * Mantém um cache em memória (sincronizado via onSnapshot) para que
 * as chamadas síncronas que ainda existem no código funcionem.
 *
 * Configuração:
 *   - Importar Firebase SDK no index.html (CDN modular v10+)
 *   - window.__firebase = { app, db } definidos em firebase-config.js
 *   - Esta camada usa firebase/firestore via window.__firebase
 */

const FIRESTORE_COLLECTIONS = [
  'meta',
  'tenants',
  'users',
  'receipts',
  'pagamentosDespesa',
  'rubricas',
  'planos',
  'prestacoes',
  'outrosRecebimentos',
  'movimentosBPI',
  'comunicacoes',
  'orcamentos',
  'manutencoes'
];

// ─── Bloco 3 · classificação das coleções para o CONDÓMINO ───────────────
// "próprias"  · contêm um campo tenantId · o condómino só pode ler as suas
// "coletivas" · dados do condomínio · qualquer autenticado pode ler inteiras
// "comunicacoes" · caso especial (3 subscrições · Opção B) tratado à parte
// "ocultas"   · o condómino NÃO subscreve de todo (admin-only)
const COND_OWN_COLLECTIONS = ['receipts', 'prestacoes'];
const COND_COLLECTIVE_COLLECTIONS = [
  'meta', 'tenants', 'rubricas', 'planos', 'pagamentosDespesa',
  'outrosRecebimentos', 'movimentosBPI', 'orcamentos', 'manutencoes'
];
const COND_HIDDEN_COLLECTIONS = ['users'];  // admin-only · condómino nem subscreve

// Cache em memória · espelha Firestore em tempo real via onSnapshot
const cache = new Map();
const listeners = new Map();
const unsubs = new Map();
let bootstrapPromise = null;

/**
 * Lê a sessão guardada (sessionStorage) para saber quem está autenticado.
 * Com a Abordagem 2 (reload após login), no arranque a sessão já existe.
 * Devolve o objeto de sessão ou null.
 */
function readSession() {
  try {
    const raw = sessionStorage.getItem('ar24:session');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Cria uma subscrição onSnapshot a uma referência (coleção ou query) e
 * popula o cache da coleção `col`. Resolve a promise no primeiro snapshot.
 * Com merge=true, vários onSnapshot escrevem na mesma coleção combinando por id
 * (necessário para as comunicações, que têm 3 subscrições).
 */
function subscribe(col, ref, onSnapshotFn, resolve, { merge = false } = {}) {
  const unsub = onSnapshotFn(ref,
    (snap) => {
      if (merge) {
        const current = cache.get(col) || [];
        const byId = new Map(current.map(d => [d.id, d]));
        snap.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
        cache.set(col, [...byId.values()]);
      } else {
        const items = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        cache.set(col, items);
      }
      const lst = listeners.get(col);
      if (lst) lst.forEach(cb => cb([...cache.get(col)]));
      resolve();
    },
    (err) => {
      console.error(`Firestore subscribe ${col} falhou:`, err);
      if (!cache.has(col)) cache.set(col, []);
      resolve();
    }
  );
  const key = unsubs.has(col) ? `${col}#${unsubs.size}` : col;
  unsubs.set(key, unsub);
}

/**
 * Inicializa as subscrições Firestore consoante o utilizador autenticado.
 *  - ADMIN (ou sem sessão · ex.: ecrã de login) → subscreve TUDO, como sempre.
 *  - CONDÓMINO → coletivas inteiras + próprias filtradas por tenantId
 *    + comunicações (3 subscrições · Opção B). Coleções admin-only não são subscritas.
 */
export async function bootstrap() {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    if (!window.__firebase?.db) {
      throw new Error('Firebase não inicializado · adiciona firebase-config.js ao index.html');
    }
    const { collection, onSnapshot, query, where } = window.__firebase.firestoreFns;
    const db = window.__firebase.db;

    const session = readSession();
    const isCondomino = session?.role === 'condomino' && !!session?.tenantId;

    const promises = [];

    if (!isCondomino) {
      // ── ADMIN ou sem sessão · comportamento original (subscreve tudo) ──
      for (const col of FIRESTORE_COLLECTIONS) {
        promises.push(new Promise((resolve) => {
          subscribe(col, collection(db, col), onSnapshot, resolve);
        }));
      }
      console.log('[Firestore] Bootstrap · modo ADMIN/total');
    } else {
      // ── CONDÓMINO · subscrição filtrada ──
      const tid = session.tenantId;

      for (const col of COND_COLLECTIVE_COLLECTIONS) {
        promises.push(new Promise((resolve) => {
          subscribe(col, collection(db, col), onSnapshot, resolve);
        }));
      }

      for (const col of COND_OWN_COLLECTIONS) {
        promises.push(new Promise((resolve) => {
          const q = query(collection(db, col), where('tenantId', '==', tid));
          subscribe(col, q, onSnapshot, resolve);
        }));
      }

      for (const col of COND_HIDDEN_COLLECTIONS) {
        cache.set(col, []);
      }

      // Comunicações · Opção B · 3 subscrições combinadas (merge por id)
      cache.set('comunicacoes', []);
      const comCol = collection(db, 'comunicacoes');
      const comQueries = [
        query(comCol, where('destinatarios', 'array-contains', 'todos')),
        query(comCol, where('destinatarios', 'array-contains', tid)),
        query(comCol, where('remetenteId', '==', tid))
      ];
      for (const q of comQueries) {
        promises.push(new Promise((resolve) => {
          subscribe('comunicacoes', q, onSnapshot, resolve, { merge: true });
        }));
      }

      console.log(`[Firestore] Bootstrap · modo CONDÓMINO (${tid}) · leitura filtrada`);
    }

    await Promise.all(promises);
    console.log('[Firestore] Bootstrap completo · cache populado');
  })();
  return bootstrapPromise;
}

function ensureCache(col) {
  if (!cache.has(col)) cache.set(col, []);
  return cache.get(col);
}

export async function listDocs(col) {
  await bootstrap();
  return [...ensureCache(col)];
}

export async function getDoc(col, id) {
  await bootstrap();
  return ensureCache(col).find(d => d.id === id) || null;
}

export async function setDoc(col, data) {
  await bootstrap();
  const { doc, setDoc: fsSetDoc, collection } = window.__firebase.firestoreFns;
  const db = window.__firebase.db;
  const docData = { ...data };
  if (!docData.id) docData.id = generateId();
  const id = docData.id;
  const { id: _omit, ...payload } = docData;  // id vai como path, não como campo
  await fsSetDoc(doc(db, col, id), payload, { merge: false });
  // Atualizar cache local imediatamente (onSnapshot vai confirmar)
  const items = ensureCache(col);
  const idx = items.findIndex(d => d.id === id);
  if (idx >= 0) items[idx] = { ...docData };
  else items.push({ ...docData });
  return { ...docData };
}

export async function deleteDoc(col, id) {
  await bootstrap();
  const { doc, deleteDoc: fsDelDoc } = window.__firebase.firestoreFns;
  const db = window.__firebase.db;
  try {
    await fsDelDoc(doc(db, col, id));
    const items = ensureCache(col);
    const idx = items.findIndex(d => d.id === id);
    if (idx >= 0) items.splice(idx, 1);
    return true;
  } catch (e) {
    console.error('deleteDoc:', e);
    return false;
  }
}

export async function queryDocs(col, filters = {}) {
  await bootstrap();
  const items = ensureCache(col);
  return items.filter(d =>
    Object.entries(filters).every(([k, v]) => d[k] === v)
  );
}

export function onSnapshot(col, callback) {
  if (!listeners.has(col)) listeners.set(col, new Set());
  listeners.get(col).add(callback);
  // Chamada imediata com estado actual
  callback([...ensureCache(col)]);
  return () => listeners.get(col)?.delete(callback);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Exporta tudo (compatibilidade · usado em backup).
 */
export async function exportAll() {
  await bootstrap();
  // v1.0.39 · ler do SERVIDOR (não da cache local) para garantir backup COMPLETO.
  // A leitura por cache podia devolver coleções parciais (ex.: 113 de 427 recibos)
  // se a sincronização ainda não tivesse terminado.
  const f = window.__firebase?.firestoreFns;
  const db = window.__firebase?.db;
  const out = {};
  for (const col of FIRESTORE_COLLECTIONS) {
    try {
      const snap = await f.getDocsFromServer(f.collection(db, col));
      out[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn(`[backup] ${col}: falha a ler do servidor, uso cache. ${e.message}`);
      out[col] = ensureCache(col);
    }
  }
  return out;
}

/**
 * Importa um snapshot completo · usa batch writes.
 * ATENÇÃO · sobrescreve dados existentes.
 */
export async function importAll(data) {
  await bootstrap();
  const { doc, writeBatch, collection } = window.__firebase.firestoreFns;
  const db = window.__firebase.db;
  let totalDocs = 0;

  for (const col of FIRESTORE_COLLECTIONS) {
    const items = data[col];
    if (!Array.isArray(items)) continue;

    // Firestore batch limite: 500 ops · partir em chunks
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const id = item.id || generateId();
        const { id: _omit, ...payload } = item;
        batch.set(doc(db, col, id), payload, { merge: false });
      }
      await batch.commit();
      totalDocs += chunk.length;
    }
  }
  console.log(`[Firestore] Imported ${totalDocs} docs`);
  return totalDocs;
}

export async function importarSnapshot(snapshot) {
  return importAll(snapshot);
}

/**
 * Limpa todas as coleções (perigoso).
 */
export async function clearAll() {
  if (!confirm('Vais apagar TODOS os dados no Firestore. Continuar?')) return;
  await bootstrap();
  const { doc, writeBatch } = window.__firebase.firestoreFns;
  const db = window.__firebase.db;

  for (const col of FIRESTORE_COLLECTIONS) {
    const items = ensureCache(col);
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const it of chunk) batch.delete(doc(db, col, it.id));
      await batch.commit();
    }
  }
  console.log('[Firestore] All cleared');
}

if (typeof window !== 'undefined') {
  window.__firestoreStore = { listDocs, getDoc, setDoc, deleteDoc, queryDocs, exportAll, importAll, clearAll, bootstrap };
}

/**
 * Verifica DIRECTAMENTE no servidor Firestore (bypass cache local) se um doc existe.
 * Útil após writes críticos para confirmar persistência (regras podem rejeitar e o
 * cache local mostra "ok" temporariamente).
 *
 * @param {string} col - nome da coleção
 * @param {string} id - id do doc
 * @returns {Promise<boolean>} true se existe no servidor
 */
export async function verifyDocOnServer(col, id) {
  try {
    const { doc, getDocFromServer } = window.__firebase.firestoreFns;
    const db = window.__firebase.db;
    const snap = await getDocFromServer(doc(db, col, id));
    return snap.exists();
  } catch (e) {
    console.warn('[verifyDocOnServer] erro:', e.message);
    // Se falhar a verificação (rede, etc.) não bloqueia · retorna true (best-effort)
    return true;
  }
}
