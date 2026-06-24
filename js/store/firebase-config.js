/**
 * Configuração Firebase · v1.x
 *
 * Exporta `firebaseReady` · promise que resolve quando o Firebase está
 * inicializado (ou resolve null se a config não estiver preenchida).
 * O local-store.js faz `await firebaseReady` antes de decidir o backend,
 * garantindo a ordem correta de inicialização.
 */

// ─── CONFIG DO PROJETO FIREBASE ─────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBndtz0BVV1v5MLmELUiNlk0w0L__EvH80",
  authDomain: "ar24-b1a18.firebaseapp.com",
  projectId: "ar24-b1a18",
  storageBucket: "ar24-b1a18.firebasestorage.app",
  messagingSenderId: "906665528152",
  appId: "1:906665528152:web:5f5a662a7c94bd4788f32d"
};

// reCAPTCHA v3 site key · App Check. "PREENCHER..." desativa.
const RECAPTCHA_V3_SITE_KEY = "6LfY6_8sAAAAANv1m-FHPvOyTPhf-WmNSmg4ixPr";

// ─── Bootstrap · exporta promise para garantir ordem ─────────────────
async function bootstrapFirebase() {
  const configValida = !firebaseConfig.apiKey.startsWith('PREENCHER');
  if (!configValida) {
    console.log('[Firebase] Config ainda não preenchida · backend localStorage');
    return null;
  }

  const [
    { initializeApp },
    firestore,
    appCheckMod,
    authMod
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js')
  ]);

  const app = initializeApp(firebaseConfig);

  const db = firestore.initializeFirestore(app, {
    localCache: firestore.persistentLocalCache({
      tabManager: firestore.persistentMultipleTabManager()
    })
  });

  if (RECAPTCHA_V3_SITE_KEY && !RECAPTCHA_V3_SITE_KEY.startsWith('PREENCHER')) {
    try {
      appCheckMod.initializeAppCheck(app, {
        provider: new appCheckMod.ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
      console.log('[Firebase] App Check ativo');
    } catch (e) {
      console.warn('[Firebase] App Check falhou:', e);
    }
  }

  const auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence);

  window.__firebase = {
    app, db, auth,
    firestoreFns: {
      collection: firestore.collection, doc: firestore.doc,
      getDoc: firestore.getDoc, getDocs: firestore.getDocs,
      getDocFromServer: firestore.getDocFromServer,
      getDocsFromServer: firestore.getDocsFromServer,
      setDoc: firestore.setDoc, deleteDoc: firestore.deleteDoc,
      writeBatch: firestore.writeBatch, onSnapshot: firestore.onSnapshot,
      query: firestore.query, where: firestore.where,
      documentId: firestore.documentId
    },
    authFns: {
      GoogleAuthProvider: authMod.GoogleAuthProvider,
      signInWithPopup: authMod.signInWithPopup,
      signInWithRedirect: authMod.signInWithRedirect,
      getRedirectResult: authMod.getRedirectResult,
      signOut: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged,
      // ── Via B · login do condómino por email/password ──
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      updatePassword: authMod.updatePassword,
      sendPasswordResetEmail: authMod.sendPasswordResetEmail,
      reauthenticateWithCredential: authMod.reauthenticateWithCredential,
      EmailAuthProvider: authMod.EmailAuthProvider
    }
  };

  console.log('[Firebase] Inicializado · projeto:', firebaseConfig.projectId);
  return window.__firebase;
}

// Promise única · resolve quando Firebase pronto (ou null)
export const firebaseReady = bootstrapFirebase().catch((e) => {
  console.error('[Firebase] Bootstrap falhou:', e);
  return null;
});
