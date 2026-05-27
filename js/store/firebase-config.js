/**
 * Configuração Firebase · v1.x
 *
 * 1. Cria o projeto Firebase com ricardojnabais@gmail.com
 * 2. Adiciona Web App e copia a configuração
 * 3. Cola a config em `firebaseConfig` abaixo
 * 4. (Opcional) Configura App Check com reCAPTCHA v3 · cola o site key abaixo
 *
 * O Firebase SDK só é descarregado se a config estiver preenchida.
 */

// ─── PREENCHER COM A CONFIG DO TEU PROJETO FIREBASE ─────────────────
// Console Firebase → Project Settings → Your apps → Web SDK config
const firebaseConfig = {
  apiKey: "PREENCHER_APIKEY",
  authDomain: "PREENCHER.firebaseapp.com",
  projectId: "PREENCHER_PROJECTID",
  storageBucket: "PREENCHER.appspot.com",
  messagingSenderId: "PREENCHER_SENDER_ID",
  appId: "PREENCHER_APPID"
};

// reCAPTCHA v3 site key · obtém em https://www.google.com/recaptcha/admin
// Ativa App Check. Deixa "PREENCHER..." para desativar.
const RECAPTCHA_V3_SITE_KEY = "PREENCHER_RECAPTCHA_SITEKEY";

// ─── Bootstrap defensivo ─────────────────────────────────────────────
const configValida = !firebaseConfig.apiKey.startsWith('PREENCHER');

if (!configValida) {
  console.log('[Firebase] Config ainda não preenchida · backend localStorage');
} else {
  // Imports dinâmicos · SDK só é descarregado quando precisamos
  const [
    { initializeApp },
    firestore,
    appCheckMod
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check.js')
  ]);

  const app = initializeApp(firebaseConfig);

  // Firestore com cache offline persistente · multi-tab safe
  const db = firestore.initializeFirestore(app, {
    localCache: firestore.persistentLocalCache({
      tabManager: firestore.persistentMultipleTabManager()
    })
  });

  // App Check
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

  window.__firebase = {
    app,
    db,
    firestoreFns: {
      collection: firestore.collection,
      doc: firestore.doc,
      getDoc: firestore.getDoc,
      getDocs: firestore.getDocs,
      setDoc: firestore.setDoc,
      deleteDoc: firestore.deleteDoc,
      writeBatch: firestore.writeBatch,
      onSnapshot: firestore.onSnapshot,
      query: firestore.query,
      where: firestore.where
    }
  };

  console.log('[Firebase] Inicializado · projeto:', firebaseConfig.projectId);
}
