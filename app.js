(function () {
  "use strict";

  const STORAGE_KEYS = {
    grading: "gradingTransactions",
    td: "teneraDuraTransactions",
    drivers: "drivers",
    suppliers: "suppliers",
    settings: "settings",
    auditLogs: "auditLogs"
  };

  const DEFAULT_SUPPLIERS = [
    "CV Lembah Hijau Perkasa",
    "Koperasi Karya Mandiri",
    "Tani Rampah Jaya",
    "PT Putra Utama Lestari",
    "Karangan Lestari",
    "PT Manunggal Adi Jaya",
    "PT Grage Bara Sejahtera"
  ];

  const DEFAULT_SETTINGS = {
    appName: "Sistem Grading TBS dan Tenera Dura",
    companyName: "PT Kedap Sayaaq Dua",
    grading: {
      baseCut: 2,
      mentahCut: 50,
      mengkalCut: 50,
      tankosCut: 1,
      overripeTolerance: 5,
      overripeCut: 25,
      busukCut: 100,
      tangkaiCut: 1,
      parthenoCut: 50,
      makanTikusCut: 15,
      goodMax: 5,
      mediumMax: 10
    },
    td: {
      teneraLabel: "Tenera",
      duraLabel: "Dura",
      balanceTolerance: 5,
      goodTeneraMin: 80,
      highDuraMax: 20
    }
  };

  const OPERATOR_CODE = "123456";
  const STAFF_CODE = "456789";
  const LOGIN_SESSION_KEY = "appLoggedIn";
  const ROLE_SESSION_KEY = "appRole";
  const COMPANY_NAME = "PT Kedap Sayaaq Dua";


  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCfUzKUTEShZ8rPVExcGGhlANLBNTFEJEo",
    authDomain: "grading-tenera-dura.firebaseapp.com",
    projectId: "grading-tenera-dura",
    storageBucket: "grading-tenera-dura.firebasestorage.app",
    messagingSenderId: "902316816139",
    appId: "1:902316816139:web:d257abc3be2f0a9220940e"
  };

  const FIREBASE_SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js"
  ];

  const FIREBASE_COLLECTIONS = {
    grading: "gradingTransactions",
    td: "teneraDuraTransactions",
    drivers: "drivers",
    suppliers: "suppliers",
    auditLogs: "auditLogs"
  };

  const FIREBASE_SETTINGS_COLLECTION = "settings";
  const FIREBASE_SETTINGS_DOC = "app";
  const FIREBASE_MIGRATION_KEY = `firebaseMigrated_${FIREBASE_CONFIG.projectId}_v1`;
  const PENDING_LOCAL_SYNC_KEY = `pendingLocalSync_${FIREBASE_CONFIG.projectId}`;

  const firebaseState = {
    app: null,
    auth: null,
    db: null,
    ready: false,
    initialized: false,
    listenersStarted: false,
    applyingRemote: false,
    syncing: false,
    syncTimer: null,
    seedingSuppliers: false,
    connecting: false,
    unsubscribers: [],
    remoteIds: {
      grading: new Set(),
      td: new Set(),
      drivers: new Set(),
      suppliers: new Set(),
      auditLogs: new Set()
    },
    snapshotReady: {
      grading: false,
      td: false,
      drivers: false,
      suppliers: false,
      auditLogs: false
    },
    lastRemoteNoticeAt: 0
  };

  const CATEGORY_LABELS = {
    mentah: "Mentah",
    mengkal: "Mengkal",
    tankos: "Tandan Kosong",
    overripe: "Overripe",
    busuk: "Busuk",
    tangkaiPanjang: "Tangkai Panjang",
    partheno: "Partheno",
    makanTikus: "Makan Tikus"
  };

  const state = {
    grading: [],
    td: [],
    drivers: [],
    suppliers: [],
    settings: clone(DEFAULT_SETTINGS),
    auditLogs: [],
    editingDriverId: null,
    editingSupplierId: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const byId = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setupFirebase();
    loadState();
    ensureDefaults();
    setupAuth();
    setupNavigation();
    setupTabs();
    setupForms();
    setupButtons();
    setupModal();
    setDefaultDates();
    renderAll();
    calculateGradingPreview();
    calculateTdPreview();
    updateAuthVisibility();
    updateRoleUI();
    showOpenMethodWarning();
    if (isLoggedIn()) {
      signInFirebaseAndStartRealtime(true).catch((error) => {
        console.warn("Firebase belum tersambung saat start. Aplikasi tetap berjalan lokal.", error);
        setFirebaseStatus("Menunggu sinkron realtime", "pending");
      });
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("Failed to parse", key, error);
      return fallback;
    }
  }

  function loadState() {
    state.grading = parseJson(STORAGE_KEYS.grading, []);
    state.td = parseJson(STORAGE_KEYS.td, []);
    state.drivers = parseJson(STORAGE_KEYS.drivers, []);
    state.suppliers = parseJson(STORAGE_KEYS.suppliers, []);
    state.settings = mergeDeep(clone(DEFAULT_SETTINGS), parseJson(STORAGE_KEYS.settings, {}));
    state.auditLogs = parseJson(STORAGE_KEYS.auditLogs, []);
  }

  function ensureDefaults() {
    if (!Array.isArray(state.suppliers) || state.suppliers.length === 0) {
      state.suppliers = DEFAULT_SUPPLIERS.map((name) => ({
        id: makeId("SUP"),
        name,
        status: "active",
        createdAt: new Date().toISOString()
      }));
    }

    state.suppliers = state.suppliers.map((supplier) => {
      if (typeof supplier === "string") {
        return { id: makeId("SUP"), name: supplier, status: "active", createdAt: new Date().toISOString() };
      }
      return { status: "active", ...supplier };
    });

    state.drivers = state.drivers.map((driver) => {
      if (typeof driver === "string") {
        return { id: makeId("DRV"), name: driver, plate: "", supplier: "", createdAt: new Date().toISOString() };
      }
      return { id: driver.id || makeId("DRV"), name: driver.name || "", plate: driver.plate || "", supplier: driver.supplier || "", createdAt: driver.createdAt || new Date().toISOString(), updatedAt: driver.updatedAt || "" };
    });

    saveAll();
  }

  function mergeDeep(target, source) {
    Object.keys(source || {}).forEach((key) => {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        target[key] = mergeDeep(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    });
    return target;
  }

  function saveAll() {
    saveAllLocalOnly();
    queueCloudSync();
  }

  function saveAllLocalOnly() {
    localStorage.setItem(STORAGE_KEYS.grading, JSON.stringify(state.grading));
    localStorage.setItem(STORAGE_KEYS.td, JSON.stringify(state.td));
    localStorage.setItem(STORAGE_KEYS.drivers, JSON.stringify(state.drivers));
    localStorage.setItem(STORAGE_KEYS.suppliers, JSON.stringify(state.suppliers));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    localStorage.setItem(STORAGE_KEYS.auditLogs, JSON.stringify(state.auditLogs));
  }


  function isOpenedDirectlyFromFile() {
    return window.location && window.location.protocol === "file:";
  }

  function showOpenMethodWarning() {
    if (!isOpenedDirectlyFromFile()) return;
    const loginStatusEl = byId("loginFirebaseStatus");
    if (loginStatusEl) {
      loginStatusEl.innerHTML = "Aplikasi siap digunakan.";
    }
    console.info("Aplikasi dibuka dari file://. Login tetap bisa dipakai. Firebase akan dicoba otomatis jika browser mengizinkan, atau jalankan via localhost/Firebase Hosting untuk sinkron realtime.");
  }

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.src === src || script.src.includes(src.split('/').pop()));
      if (existing && existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      if (existing && !existing.dataset.dynamicRetry) {
        existing.addEventListener("load", () => { existing.dataset.loaded = "true"; resolve(); }, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Gagal memuat ${src}`)), { once: true });
        if (typeof firebase !== "undefined") resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.defer = false;
      script.dataset.dynamicRetry = "true";
      script.onload = () => { script.dataset.loaded = "true"; resolve(); };
      script.onerror = () => reject(new Error(`Gagal memuat ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureFirebaseSdkLoaded() {
    if (typeof firebase !== "undefined" && firebase.auth && firebase.firestore) return;
    setFirebaseStatus("Memuat Firebase SDK...", "syncing");
    for (const src of FIREBASE_SDK_URLS) {
      if (typeof firebase !== "undefined" && firebase.auth && firebase.firestore) break;
      await loadExternalScript(src);
    }
    if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) {
      throw new Error("Firebase SDK belum termuat. Periksa koneksi internet atau CDN Firebase.");
    }
  }

  function setupFirebase() {
    if (firebaseState.initialized) return;
    if (typeof firebase === "undefined") {
      setFirebaseStatus("Firebase SDK belum termuat", "error");
      console.error("Firebase SDK tidak ditemukan. Periksa koneksi internet dan script Firebase di index.html. Saat login aplikasi akan mencoba memuat ulang SDK.");
      return;
    }

    try {
      firebaseState.app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
      firebaseState.auth = firebase.auth();
      firebaseState.db = firebase.firestore();
      firebaseState.initialized = true;
      setFirebaseStatus("Firebase siap, belum login", "pending");

      try {
        firebaseState.db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
          console.warn("Offline persistence Firestore tidak aktif:", error.code || error.message);
        });
      } catch (error) {
        console.warn("Offline persistence tidak bisa diaktifkan:", error.message);
      }
    } catch (error) {
      console.error("Gagal inisialisasi Firebase:", error);
      setFirebaseStatus("Firebase gagal init", "error");
    }
  }

  async function signInFirebaseAndStartRealtime(silent = false) {
    if (firebaseState.ready && firebaseState.listenersStarted) return true;
    if (firebaseState.connecting) return false;
    firebaseState.connecting = true;

    try {
      await ensureFirebaseSdkLoaded();
      setupFirebase();

      if (!firebaseState.auth || !firebaseState.db) {
        const message = "Firebase belum siap. Pastikan koneksi internet aktif dan SDK Firebase termuat.";
        setFirebaseStatus("Sinkronisasi belum siap", "error");
        if (!silent) toast(message, true);
        throw new Error(message);
      }

      setFirebaseStatus("Menghubungkan sinkronisasi...", "syncing");
      if (!firebaseState.auth.currentUser) {
        await firebaseState.auth.signInAnonymously();
      }

      setFirebaseStatus("Menguji akses database...", "syncing");
      await testFirestoreConnection();
      firebaseState.ready = true;
      sessionStorage.setItem(LOGIN_SESSION_KEY, "true");
      updateAuthVisibility();
      renderAll();
      await migrateLocalDataToFirestoreOnce();

      if (sessionStorage.getItem(PENDING_LOCAL_SYNC_KEY) === "true") {
        await fullCloudSync();
        sessionStorage.removeItem(PENDING_LOCAL_SYNC_KEY);
      }

      startRealtimeListeners();
      setFirebaseStatus("Realtime aktif - data tersinkron", "online");
      if (!silent) toast("Sinkronisasi aktif.");
      return true;
    } catch (error) {
      console.error("Firebase sign-in/realtime gagal:", error);
      setFirebaseStatus("Menunggu sinkron realtime", "pending");
      if (!silent) {
        toast("Mode lokal aktif. Sinkronisasi belum tersambung, data tetap tersimpan di perangkat ini.", true);
      }
      throw error;
    } finally {
      firebaseState.connecting = false;
    }
  }

  async function runFirebaseDiagnostic(showToast = true) {
    try {
      setFirebaseStatus("Mengecek Firebase...", "syncing");
      await ensureFirebaseSdkLoaded();
      setupFirebase();
      if (!firebaseState.auth || !firebaseState.db) throw new Error("Firebase belum siap.");
      if (!firebaseState.auth.currentUser) await firebaseState.auth.signInAnonymously();
      await testFirestoreConnection();
      firebaseState.ready = true;
      setFirebaseStatus("Realtime aktif - data tersinkron", "online");
      if (showToast) toast("Firebase database aktif dan bisa dibaca/ditulis.");
      return true;
    } catch (error) {
      const detail = firebaseFriendlyError(error);
      console.error("Diagnostik Firebase gagal:", error);
      setFirebaseStatus(detail, "error");
      if (showToast) toast(detail, true);
      return false;
    }
  }

  async function testFirestoreConnection() {
    if (!firebaseState.db) throw new Error("Firestore belum siap.");
    const ref = firebaseState.db.collection(FIREBASE_SETTINGS_COLLECTION).doc(FIREBASE_SETTINGS_DOC);
    const payload = {
      lastConnectionCheckAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastConnectionCheckFrom: "web-html-css-js",
      firebaseProjectId: FIREBASE_CONFIG.projectId
    };
    await ref.set(payload, { merge: true });
    await ref.get();
  }

  async function migrateLocalDataToFirestoreOnce() {
    if (!firebaseState.db || localStorage.getItem(FIREBASE_MIGRATION_KEY) === "true") return;
    try {
      setFirebaseStatus("Menyiapkan database Firebase...", "syncing");
      const settingsRef = firebaseState.db.collection(FIREBASE_SETTINGS_COLLECTION).doc(FIREBASE_SETTINGS_DOC);
      const settingsDoc = await settingsRef.get();
      if (!settingsDoc.exists) {
        await settingsRef.set(cleanForFirestore(state.settings), { merge: true });
      }

      const supplierSnapshot = await firebaseState.db.collection(FIREBASE_COLLECTIONS.suppliers).limit(1).get();
      if (supplierSnapshot.empty) {
        await seedDefaultSuppliersToFirestore();
      }

      localStorage.setItem(FIREBASE_MIGRATION_KEY, "true");
    } catch (error) {
      console.error("Persiapan database Firebase gagal:", error);
      setFirebaseStatus("Persiapan Firebase gagal", "error");
      throw error;
    }
  }

  function startRealtimeListeners() {
    if (!firebaseState.ready || !firebaseState.db || firebaseState.listenersStarted) return;
    firebaseState.listenersStarted = true;
    listenArrayCollection("grading", "date", "desc");
    listenArrayCollection("td", "date", "desc");
    listenArrayCollection("drivers", "name", "asc");
    listenArrayCollection("suppliers", "name", "asc");
    listenArrayCollection("auditLogs", "at", "desc");
    listenSettings();
  }

  function stopRealtimeListeners() {
    firebaseState.unsubscribers.forEach((unsubscribe) => {
      try { unsubscribe(); } catch (error) { console.warn(error); }
    });
    firebaseState.unsubscribers = [];
    firebaseState.listenersStarted = false;
    firebaseState.ready = false;
  }

  function listenArrayCollection(key, orderField, direction) {
    const collectionName = FIREBASE_COLLECTIONS[key];
    if (!collectionName) return;
    let query = firebaseState.db.collection(collectionName);
    if (orderField) query = query.orderBy(orderField, direction || "asc");

    const unsubscribe = query.onSnapshot((snapshot) => {
      if (key === "suppliers" && snapshot.empty) {
        seedDefaultSuppliersToFirestore();
        return;
      }
      const wasReady = !!firebaseState.snapshotReady[key];
      firebaseState.applyingRemote = true;
      const rows = snapshot.docs.map((doc) => normalizeFirestoreRecord(doc.data(), doc.id, key));
      state[key] = rows;
      firebaseState.remoteIds[key] = new Set(snapshot.docs.map((doc) => doc.id));
      firebaseState.snapshotReady[key] = true;
      saveAllLocalOnly();
      renderAll();
      firebaseState.applyingRemote = false;
      const pending = snapshot.metadata && snapshot.metadata.hasPendingWrites;
      const cached = snapshot.metadata && snapshot.metadata.fromCache;
      if (pending) {
        setFirebaseStatus("Menyinkronkan...", "syncing");
      } else if (cached) {
        setFirebaseStatus("Menunggu koneksi realtime", "pending");
      } else {
        setFirebaseStatus("Realtime aktif - data tersinkron", "online");
        if (wasReady && ["grading", "td"].includes(key)) showRealtimeToastOnce("Data realtime diperbarui dari perangkat lain.");
      }
    }, (error) => {
      firebaseState.applyingRemote = false;
      console.error(`Listener Firestore ${collectionName} gagal:`, error);
      setFirebaseStatus("Firebase listener error", "error");
      toast("Firestore error. Periksa Rules dan koneksi internet.", true);
    });
    firebaseState.unsubscribers.push(unsubscribe);
  }

  async function seedDefaultSuppliersToFirestore() {
    if (firebaseState.seedingSuppliers || !firebaseState.db) return;
    firebaseState.seedingSuppliers = true;
    try {
      const defaults = DEFAULT_SUPPLIERS.map((name) => ({
        id: `supplier-${slugify(name)}`,
        name,
        status: "active",
        createdAt: new Date().toISOString()
      }));
      await syncArrayToFirestore("suppliers", defaults, { allowDelete: false });
    } catch (error) {
      console.error("Gagal seed supplier default:", error);
      setFirebaseStatus("Seed supplier gagal", "error");
    } finally {
      firebaseState.seedingSuppliers = false;
    }
  }

  function listenSettings() {
    const unsubscribe = firebaseState.db.collection(FIREBASE_SETTINGS_COLLECTION).doc(FIREBASE_SETTINGS_DOC).onSnapshot((doc) => {
      firebaseState.applyingRemote = true;
      if (doc.exists) {
        state.settings = mergeDeep(clone(DEFAULT_SETTINGS), normalizeFirestoreRecord(doc.data(), doc.id));
        saveAllLocalOnly();
        renderAll();
      } else {
        firebaseState.applyingRemote = false;
        firebaseState.db.collection(FIREBASE_SETTINGS_COLLECTION).doc(FIREBASE_SETTINGS_DOC).set(cleanForFirestore(state.settings), { merge: true });
        return;
      }
      firebaseState.applyingRemote = false;
      setFirebaseStatus("Realtime aktif - data tersinkron", "online");
    }, (error) => {
      firebaseState.applyingRemote = false;
      console.error("Listener settings gagal:", error);
      setFirebaseStatus("Firebase settings error", "error");
    });
    firebaseState.unsubscribers.push(unsubscribe);
  }

  function normalizeFirestoreRecord(data, fallbackId, collectionKey) {
    const normalized = { ...(data || {}) };
    if (fallbackId && ["suppliers", "drivers", "auditLogs"].includes(collectionKey)) normalized.id = fallbackId;
    if (!normalized.id && fallbackId) normalized.id = fallbackId;
    Object.keys(normalized).forEach((fieldKey) => {
      const value = normalized[fieldKey];
      if (value && typeof value.toDate === "function") normalized[fieldKey] = value.toDate().toISOString();
    });
    return normalized;
  }

  function queueCloudSync() {
    if (firebaseState.applyingRemote) return;
    if (!firebaseState.ready || !firebaseState.db) {
      if (isLoggedIn()) {
        sessionStorage.setItem(PENDING_LOCAL_SYNC_KEY, "true");
        signInFirebaseAndStartRealtime(true).catch((error) => {
          console.warn("Sinkronisasi belum aktif, perubahan disimpan lokal sementara:", error);
        });
      }
      return;
    }
    clearTimeout(firebaseState.syncTimer);
    firebaseState.syncTimer = setTimeout(() => fullCloudSync(), 250);
  }

  async function fullCloudSync() {
    if (!firebaseState.ready || firebaseState.applyingRemote || firebaseState.syncing || !firebaseState.db) return;
    firebaseState.syncing = true;
    setFirebaseStatus("Menyinkronkan...", "syncing");
    try {
      await syncArrayToFirestore("suppliers", state.suppliers, { allowDelete: false });
      await syncArrayToFirestore("drivers", state.drivers, { allowDelete: false });
      await syncArrayToFirestore("grading", state.grading, { allowDelete: false });
      await syncArrayToFirestore("td", state.td, { allowDelete: false });
      await syncArrayToFirestore("auditLogs", state.auditLogs, { allowDelete: false });
      await firebaseState.db.collection(FIREBASE_SETTINGS_COLLECTION).doc(FIREBASE_SETTINGS_DOC).set(cleanForFirestore(state.settings), { merge: true });
      setFirebaseStatus("Realtime aktif - data tersinkron", "online");
    } catch (error) {
      console.error("Sinkronisasi Firestore gagal:", error);
      setFirebaseStatus("Sync Firebase gagal", "error");
      toast("Sinkronisasi Firebase gagal. Data tetap disimpan lokal sementara.", true);
    } finally {
      firebaseState.syncing = false;
    }
  }

  async function syncArrayToFirestore(key, rows, options = {}) {
    if (!firebaseState.db || !FIREBASE_COLLECTIONS[key]) return;
    const collectionRef = firebaseState.db.collection(FIREBASE_COLLECTIONS[key]);
    const localRows = Array.isArray(rows) ? rows : [];
    const localIds = new Set();
    let operations = [];

    localRows.forEach((row) => {
      const id = getFirestoreDocId(key, row);
      row.id = id;
      localIds.add(id);
      operations.push({ type: "set", ref: collectionRef.doc(id), data: cleanForFirestore({ ...row, id }) });
    });

    if (options.allowDelete) {
      const remoteSet = firebaseState.remoteIds[key] || new Set();
      remoteSet.forEach((remoteId) => {
        if (!localIds.has(remoteId)) operations.push({ type: "delete", ref: collectionRef.doc(remoteId) });
      });
    }

    await commitBatchedOperations(operations);
  }

  async function commitBatchedOperations(operations) {
    if (!operations.length) return;
    const maxOpsPerBatch = 450;
    for (let i = 0; i < operations.length; i += maxOpsPerBatch) {
      const batch = firebaseState.db.batch();
      operations.slice(i, i + maxOpsPerBatch).forEach((operation) => {
        if (operation.type === "set") batch.set(operation.ref, operation.data, { merge: true });
        if (operation.type === "delete") batch.delete(operation.ref);
      });
      await batch.commit();
    }
  }


  async function deleteFirestoreDoc(key, id) {
    if (!firebaseState.ready || !firebaseState.db || !FIREBASE_COLLECTIONS[key] || !id) return;
    try {
      await firebaseState.db.collection(FIREBASE_COLLECTIONS[key]).doc(String(id)).delete();
    } catch (error) {
      console.warn("Gagal menghapus dokumen Firestore:", key, id, error);
      toast("Data lokal terhapus, tetapi sinkron hapus belum berhasil. Cek koneksi.", true);
    }
  }

  async function setFirestoreDoc(key, row) {
    if (!firebaseState.ready || !firebaseState.db || !FIREBASE_COLLECTIONS[key] || !row) return false;
    const id = getFirestoreDocId(key, row);
    try {
      setFirebaseStatus("Menyinkronkan...", "syncing");
      await firebaseState.db.collection(FIREBASE_COLLECTIONS[key]).doc(String(id)).set(cleanForFirestore({ ...row, id }), { merge: true });
      setFirebaseStatus("Realtime aktif - data tersinkron", "online");
      return true;
    } catch (error) {
      console.warn("Gagal menulis dokumen Firestore:", key, id, error);
      setFirebaseStatus("Gagal sinkron. Data disimpan lokal", "error");
      return false;
    }
  }

  function cleanForFirestore(value) {
    return JSON.parse(JSON.stringify(value, (_key, val) => (val === undefined ? null : val)));
  }

  function getFirestoreDocId(key, row) {
    if (key === "suppliers") return sanitizeFirestoreId(`supplier-${slugify(row.name || row.id || makeId("SUP"))}`);
    if (key === "drivers") return sanitizeFirestoreId(`driver-${slugify(row.name || row.id || makeId("DRV"))}`);
    if (key === "auditLogs") return sanitizeFirestoreId(row.id || row.transactionId || makeId("LOG"));
    return sanitizeFirestoreId(row.id || makeId(key.toUpperCase()));
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || makeId("DOC").toLowerCase();
  }

  function sanitizeFirestoreId(id) {
    return String(id || makeId("DOC")).replace(/[\\/#?\[\]]/g, "-").slice(0, 140);
  }

  async function clearFirestoreCollections() {
    if (!firebaseState.ready || !firebaseState.db) return;
    setFirebaseStatus("Menghapus data Firebase...", "syncing");
    for (const key of Object.keys(FIREBASE_COLLECTIONS)) {
      const snapshot = await firebaseState.db.collection(FIREBASE_COLLECTIONS[key]).get();
      const operations = snapshot.docs.map((doc) => ({ type: "delete", ref: doc.ref }));
      await commitBatchedOperations(operations);
    }
    await firebaseState.db.collection(FIREBASE_SETTINGS_COLLECTION).doc(FIREBASE_SETTINGS_DOC).delete().catch(() => null);
  }

  function setFirebaseStatus(message, mode = "pending") {
    const statusEl = byId("firebaseStatus");
    const loginStatusEl = byId("loginFirebaseStatus");
    const text = message || "Firebase";
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.classList.remove("firebase-status-pending", "firebase-status-online", "firebase-status-syncing", "firebase-status-error");
      statusEl.classList.add(`firebase-status-${mode}`);
    }
    if (loginStatusEl) loginStatusEl.textContent = text;
  }

  function showRealtimeToastOnce(message) {
    const now = Date.now();
    if (now - (firebaseState.lastRemoteNoticeAt || 0) < 2500) return;
    firebaseState.lastRemoteNoticeAt = now;
    toast(message || "Data realtime diperbarui.");
  }

  function firebaseFriendlyError(error) {
    const code = error?.code || "";
    const message = error?.message || "";
    if (code.includes("auth/admin-restricted-operation") || code.includes("operation-not-allowed")) {
      return "Firebase Auth Anonymous belum aktif. Aktifkan Authentication > Sign-in method > Anonymous.";
    }
    if (code.includes("permission-denied")) {
      return "Firestore Rules menolak akses. Publish rules yang mengizinkan request.auth != null.";
    }
    if (code.includes("unavailable") || code.includes("network") || message.toLowerCase().includes("network")) {
      return "Firebase tidak bisa diakses. Periksa internet atau jalankan aplikasi lewat localhost/hosting.";
    }
    if (location.protocol === "file:") {
      return "Firebase gagal dari mode file://. Jalankan lewat localhost atau Firebase Hosting.";
    }
    return "Gagal konek Firebase. Cek Anonymous Auth, Firestore Rules, dan koneksi internet.";
  }

  function setupAuth() {
    const loginForm = byId("loginForm");
    const codeInput = byId("accessCodeInput") || byId("loginCode");
    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const code = String(codeInput?.value || "").trim();
        let role = "";
        if (code === OPERATOR_CODE) role = "operator";
        if (code === STAFF_CODE) role = "staff";
        if (!role) {
          if (byId("loginError")) byId("loginError").textContent = "Kode masuk salah.";
          if (codeInput) codeInput.select();
          toast("Kode masuk salah.", true);
          return;
        }

        sessionStorage.setItem(LOGIN_SESSION_KEY, "true");
        sessionStorage.setItem(ROLE_SESSION_KEY, role);
        if (byId("loginError")) byId("loginError").textContent = "";
        if (codeInput) codeInput.value = "";
        setFirebaseStatus("Sinkronisasi disiapkan", "pending");
        updateAuthVisibility();
        updateRoleUI();
        renderAll();
        toast(`Masuk sebagai ${role === "staff" ? "Staff" : "Operator"}.`);

        // Login dibuat ringan: aplikasi langsung terbuka. Firebase tetap dicoba di belakang layar,
        // tetapi kegagalan Firebase tidak mengunci aplikasi dan tidak menghapus sesi login.
        signInFirebaseAndStartRealtime(true).catch((error) => {
          console.warn("Firebase belum tersambung, aplikasi berjalan dalam mode lokal:", error);
          setFirebaseStatus("Menunggu sinkron realtime", "pending");
        });
      });
    }

    $$('[data-exit]').forEach((button) => button.addEventListener("click", exitApp));
    ["exitButton", "topExitButton"].forEach((id) => {
      const button = byId(id);
      if (button) button.addEventListener("click", exitApp);
    });
  }

  function isLoggedIn() {
    return sessionStorage.getItem(LOGIN_SESSION_KEY) === "true";
  }

  function getCurrentRole() {
    return sessionStorage.getItem(ROLE_SESSION_KEY) || "";
  }

  function isStaff() {
    return getCurrentRole() === "staff";
  }

  function isOperator() {
    return getCurrentRole() === "operator";
  }

  function requireStaffAction() {
    if (!isStaff()) {
      alert("Akses ini hanya untuk Staff.");
      toast("Akses ini hanya untuk Staff.", true);
      return false;
    }
    return true;
  }

  function updateRoleUI() {
    const role = getCurrentRole();
    const roleText = role === "staff" ? "Staff" : role === "operator" ? "Operator" : "-";
    const roleLabel = byId("roleLabel");
    if (roleLabel) roleLabel.textContent = `Role: ${roleText}`;
    document.body.classList.toggle("role-staff", isStaff());
    document.body.classList.toggle("role-operator", isOperator());
    $$('[data-staff-only]').forEach((el) => el.classList.toggle("staff-hidden", !isStaff()));
    const locked = isLoggedIn() && !isStaff();
    $$("#settingsSection input, #settingsSection select, #settingsSection textarea").forEach((el) => {
      if (el.type !== "file") el.disabled = locked;
    });
    const notice = byId("operatorAccessNotice");
    if (notice) notice.remove();
    if (locked) {
      const settings = byId("settingsSection");
      if (settings) {
        const div = document.createElement("div");
        div.id = "operatorAccessNotice";
        div.className = "role-notice";
        div.textContent = "Anda masuk sebagai Operator. Pengaturan, edit, hapus, dan master data hanya untuk Staff.";
        settings.prepend(div);
      }
    }
  }

  function updateAuthVisibility() {
    const logged = isLoggedIn();
    const loginScreen = byId("loginScreen");
    const appShell = byId("appShell");
    const codeInput = byId("accessCodeInput") || byId("loginCode");
    if (loginScreen) loginScreen.classList.toggle("hidden", logged);
    if (appShell) {
      appShell.classList.toggle("auth-hidden", !logged);
      appShell.classList.toggle("locked", !logged);
    }
    document.body.classList.toggle("login-mode", !logged);
    if (!logged && codeInput) setTimeout(() => codeInput.focus(), 50);
    if (!logged && firebaseState.initialized) setFirebaseStatus("Sinkronisasi siap", "pending");
    updateRoleUI();
  }

  async function exitApp() {
    if (!confirm("Yakin ingin keluar dari aplikasi?")) return;
    sessionStorage.removeItem(LOGIN_SESSION_KEY);
    sessionStorage.removeItem(ROLE_SESSION_KEY);
    sessionStorage.removeItem(PENDING_LOCAL_SYNC_KEY);
    stopRealtimeListeners();
    try {
      if (firebaseState.auth) await firebaseState.auth.signOut();
    } catch (error) {
      console.warn("Firebase signOut gagal:", error);
    }
    closeMobileSidebar();
    updateAuthVisibility();
    setFirebaseStatus("Firebase: keluar", "pending");
    toast("Anda sudah keluar. Data tetap aman.");
  }

  function setupNavigation() {
    $$(".nav-link").forEach((button) => {
      button.addEventListener("click", () => {
        const sectionId = button.dataset.section;
        if (!sectionId) return;
        showSection(sectionId);
        closeMobileSidebar();
      });
    });

    byId("mobileMenuButton").addEventListener("click", () => {
      toggleMobileSidebar();
    });
    byId("mobileCloseMenuButton")?.addEventListener("click", closeMobileSidebar);
    byId("sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);
  }

  function toggleMobileSidebar() {
    const sidebar = byId("sidebar");
    if (!sidebar) return;
    const willOpen = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", willOpen);
    document.body.classList.toggle("sidebar-open", willOpen);
  }

  function closeMobileSidebar() {
    byId("sidebar")?.classList.remove("open");
    document.body.classList.remove("sidebar-open");
  }

  function showSection(sectionId) {
    $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.section === sectionId));
    $$(".section").forEach((section) => section.classList.toggle("active", section.id === sectionId));
    const activeButton = $(`.nav-link[data-section="${sectionId}"]`);
    byId("pageTitle").textContent = activeButton ? activeButton.textContent : "Dashboard";
    byId("pageSubtitle").textContent = getSubtitle(sectionId);
    if (sectionId === "dashboardSection") renderDashboard();
    if (sectionId === "dataSection") renderDataTables();
    if (sectionId === "analysisSection") renderAnalysis();
    if (sectionId === "masterSection") renderMasterData();
  }

  function getSubtitle(sectionId) {
    const subtitles = {
      dashboardSection: "Ringkasan Grading TBS dan Tenera Dura",
      inputSection: "Input data harian dengan hitungan otomatis",
      dataSection: "Data transaksi, detail, edit, hapus, dan export Excel",
      reportSection: "Laporan siap copy ke WhatsApp",
      analysisSection: "Rekap overall, per supplier, per sopir, dan ranking",
      masterSection: "Data sopir, supplier, dan plat",
      settingsSection: "Rumus potongan, tenera dura, backup, dan restore"
    };
    return subtitles[sectionId] || "";
  }

  function setupTabs() {
    document.addEventListener("click", (event) => {
      const tabButton = event.target.closest(".tab-button");
      if (!tabButton) return;
      const group = tabButton.dataset.tabGroup;
      const tabId = tabButton.dataset.tab;
      $$( `.tab-button[data-tab-group="${group}"]`).forEach((button) => button.classList.toggle("active", button === tabButton));
      $$( `.tab-content[data-tab-group="${group}"]`).forEach((tab) => tab.classList.toggle("active", tab.id === tabId));
    });
  }

  function setupForms() {
    const gradingForm = byId("gradingForm");
    const tdForm = byId("tdForm");

    gradingForm.addEventListener("input", () => {
      applyDriverAutofill(gradingForm);
      calculateGradingPreview();
    });
    gradingForm.addEventListener("change", () => {
      applyDriverAutofill(gradingForm);
      calculateGradingPreview();
    });
    gradingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveGradingFromForm(false);
    });
    gradingForm.addEventListener("reset", () => {
      setTimeout(() => {
        gradingForm.elements.date.value = todayString();
        calculateGradingPreview();
      }, 0);
    });

    tdForm.addEventListener("input", () => {
      applyDriverAutofill(tdForm);
      calculateTdPreview();
    });
    tdForm.addEventListener("change", () => {
      applyDriverAutofill(tdForm);
      calculateTdPreview();
    });
    tdForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveTdFromForm(false);
    });
    tdForm.addEventListener("reset", () => {
      setTimeout(() => {
        tdForm.elements.date.value = todayString();
        calculateTdPreview();
      }, 0);
    });
  }

  function setupButtons() {
    byId("firebaseReconnectButton")?.addEventListener("click", () => runFirebaseDiagnostic(true));
    byId("firebaseDiagnosticButton")?.addEventListener("click", () => runFirebaseDiagnostic(true));
    byId("saveGradingReportButton").addEventListener("click", () => saveGradingFromForm(true));
    byId("saveTdReportButton").addEventListener("click", () => saveTdFromForm(true));

    byId("refreshDashboardButton").addEventListener("click", renderDashboard);
    byId("applyDataFilterButton").addEventListener("click", renderDataTables);
    byId("generateReportButton").addEventListener("click", generateReport);
    byId("copyReportButton").addEventListener("click", copyReport);
    byId("downloadReportButton").addEventListener("click", downloadReportTxt);
    byId("openWhatsappButton").addEventListener("click", openWhatsapp);
    byId("previewJpgReportButton")?.addEventListener("click", () => previewReportJpgFromFilters("preview"));
    byId("downloadJpgReportButton")?.addEventListener("click", () => previewReportJpgFromFilters("download"));
    byId("shareJpgReportButton")?.addEventListener("click", () => previewReportJpgFromFilters("share"));
    byId("previewDailyJpgButton")?.addEventListener("click", () => openDailyJpgPreview());
    byId("downloadDailyJpgButton")?.addEventListener("click", () => downloadDailyJpg(false));
    byId("shareDailyJpgButton")?.addEventListener("click", () => downloadDailyJpg(true));
    byId("downloadDataFilteredJpgButton")?.addEventListener("click", () => downloadDataFilteredJpg(false));
    byId("shareDataFilteredJpgButton")?.addEventListener("click", () => downloadDataFilteredJpg(true));
    byId("analysisWaGradingButton")?.addEventListener("click", () => generateAnalysisWhatsappReport("grading"));
    byId("analysisWaTdButton")?.addEventListener("click", () => generateAnalysisWhatsappReport("td"));
    byId("refreshAnalysisButton").addEventListener("click", renderAnalysis);

    byId("exportGradingButton").addEventListener("click", () => exportGradingExcel(getFilteredData().grading));
    byId("exportTdButton").addEventListener("click", () => exportTdExcel(getFilteredData().td));
    byId("exportCombinedButton").addEventListener("click", () => exportCombinedExcel(getFilteredData().grading, getFilteredData().td));

    byId("saveDriverButton").addEventListener("click", saveMasterDriver);
    byId("saveSupplierButton").addEventListener("click", saveMasterSupplier);
    byId("newSupplierButton")?.addEventListener("click", clearSupplierForm);

    byId("saveGeneralSettingsButton").addEventListener("click", saveGeneralSettings);
    byId("saveGradingSettingsButton").addEventListener("click", saveGradingSettings);
    byId("resetGradingSettingsButton").addEventListener("click", resetGradingSettings);
    byId("saveTdSettingsButton").addEventListener("click", saveTdSettings);
    byId("resetTdSettingsButton").addEventListener("click", resetTdSettings);

    byId("exportBackupButton").addEventListener("click", exportBackupJson);
    byId("quickBackupButton").addEventListener("click", exportBackupJson);
    byId("importBackupInput").addEventListener("change", importBackupJson);
    byId("clearAllDataButton").addEventListener("click", confirmClearAllData);

    ["dashboardPreset", "dataPreset", "reportPreset", "analysisPreset", "masterPreset"].forEach((id) => {
      const el = byId(id);
      if (el) el.addEventListener("change", () => applyPresetToInputs(id));
    });
    byId("refreshMasterButton")?.addEventListener("click", renderMasterData);
    byId("exportMasterExcelButton")?.addEventListener("click", exportMasterExcel);

    document.addEventListener("click", handleDocumentActions);
  }


  function buildWhatsappUrl(text) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  function setupModal() {
    document.addEventListener("click", (event) => {
      if (event.target.matches("[data-close-modal]")) closeModal();
    });
  }

  function handleDocumentActions(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;
    const staffActions = new Set(["edit-grading", "delete-grading", "edit-td", "delete-td", "save-edit-grading", "save-edit-td", "confirm-delete-grading", "confirm-delete-td", "edit-driver", "delete-driver", "edit-supplier", "toggle-supplier", "delete-supplier"]);
    if (staffActions.has(action) && !requireStaffAction()) return;

    const actions = {
      "detail-grading": () => openGradingDetail(id),
      "edit-grading": () => openGradingEdit(id),
      "delete-grading": () => confirmDeleteRecord("grading", id),
      "wa-grading": () => reportSingleGrading(id),
      "jpg-grading": () => downloadRecordJpg("grading", id, { shareAfter: false }),
      "share-jpg-grading": () => downloadRecordJpg("grading", id, { shareAfter: true }),
      "preview-jpg-grading": () => openJpgPreview("grading", id),
      "download-jpg-grading": () => downloadRecordJpg("grading", id, { shareAfter: false }),
      "share-download-jpg-grading": () => downloadRecordJpg("grading", id, { shareAfter: true }),
      "detail-td": () => openTdDetail(id),
      "edit-td": () => openTdEdit(id),
      "delete-td": () => confirmDeleteRecord("td", id),
      "wa-td": () => reportSingleTd(id),
      "jpg-td": () => downloadRecordJpg("td", id, { shareAfter: false }),
      "share-jpg-td": () => downloadRecordJpg("td", id, { shareAfter: true }),
      "preview-jpg-td": () => openJpgPreview("td", id),
      "download-jpg-td": () => downloadRecordJpg("td", id, { shareAfter: false }),
      "share-download-jpg-td": () => downloadRecordJpg("td", id, { shareAfter: true }),
      "save-edit-grading": () => saveEditedGrading(id),
      "save-edit-td": () => saveEditedTd(id),
      "confirm-delete-grading": () => deleteRecord("grading", id),
      "confirm-delete-td": () => deleteRecord("td", id),
      "edit-driver": () => loadDriverToForm(id),
      "delete-driver": () => deleteDriver(id),
      "edit-supplier": () => loadSupplierToForm(id),
      "toggle-supplier": () => toggleSupplierStatus(id),
      "delete-supplier": () => deleteSupplier(id)
    };

    if (actions[action]) actions[action]();
  }

  function setDefaultDates() {
    const today = todayString();
    $$("input[type='date']").forEach((input) => {
      if (!input.value) input.value = today;
    });
    ["dashboardPreset", "dataPreset", "reportPreset", "analysisPreset", "masterPreset"].forEach(applyPresetToInputs);
  }

  function applyPresetToInputs(presetId) {
    const prefix = presetId.replace("Preset", "");
    const preset = byId(presetId).value;
    const start = byId(`${prefix}Start`);
    const end = byId(`${prefix}End`);
    if (!start || !end) return;
    const range = getPresetRange(preset);
    if (preset !== "custom") {
      start.value = range.start || "";
      end.value = range.end || "";
    }
  }

  function renderAll() {
    renderSettingsToInputs();
    updateBrand();
    renderSupplierOptions();
    renderDriverDatalist();
    renderOfficerDatalist();
    renderDashboard();
    renderDataTables();
    renderAnalysis();
    renderMasterData();
    byId("todayLabel").textContent = formatDate(todayString());
    updateRoleUI();
  }

  function renderSupplierOptions() {
    const activeSuppliers = state.suppliers.filter((supplier) => supplier.status !== "inactive");
    const allSuppliers = state.suppliers;
    const optionHtml = activeSuppliers.map((supplier) => `<option value="${escapeHtml(supplier.name)}">${escapeHtml(supplier.name)}</option>`).join("");
    const filterOptionHtml = allSuppliers.map((supplier) => `<option value="${escapeHtml(supplier.name)}">${escapeHtml(supplier.name)}${supplier.status === "inactive" ? " (nonaktif)" : ""}</option>`).join("");
    $$(".supplier-select").forEach((select) => {
      const current = select.value;
      select.innerHTML = `<option value="">Pilih supplier</option>${optionHtml}`;
      if (current) select.value = current;
    });
    $$(".supplier-filter").forEach((select) => {
      const current = select.value;
      select.innerHTML = `<option value="">Semua supplier</option>${filterOptionHtml}`;
      if (current) select.value = current;
    });
  }

  function renderDriverDatalist() {
    byId("driversList").innerHTML = state.drivers
      .filter((driver) => driver.name)
      .map((driver) => `<option value="${escapeHtml(driver.name)}"></option>`)
      .join("");
  }

  function renderOfficerDatalist() {
    const list = byId("officersList");
    if (!list) return;
    const names = new Set();
    [...gradingData, ...tdData].forEach((row) => {
      const officer = String(row.officer || row.createdBy || "").trim();
      if (officer) names.add(officer);
    });
    list.innerHTML = Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
  }

  function updateBrand() {
    const company = !state.settings.companyName || state.settings.companyName === "Tenera Dura" ? COMPANY_NAME : state.settings.companyName;
    byId("brandAppName").textContent = state.settings.appName || DEFAULT_SETTINGS.appName;
    byId("brandCompanyName").textContent = company;
  }

  function getNumber(form, name) {
    const value = Number(form.elements[name]?.value || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function getText(form, name) {
    return String(form.elements[name]?.value || "").trim();
  }

  function calculateGrading(values) {
    const settings = state.settings.grading;
    const totalJanjang = Math.max(0, Number(values.totalJanjang || 0));
    const mentah = Math.max(0, Number(values.mentah || 0));
    const mengkal = Math.max(0, Number(values.mengkal || 0));
    const tankos = Math.max(0, Number(values.tankos || 0));
    const overripe = Math.max(0, Number(values.overripe || 0));
    const busuk = Math.max(0, Number(values.busuk || 0));
    const tangkaiPanjang = Math.max(0, Number(values.tangkaiPanjang || 0));
    const partheno = Math.max(0, Number(values.partheno || 0));
    const makanTikus = Math.max(0, Number(values.makanTikus || 0));

    const totalTidakMasak = mentah + mengkal + tankos + overripe + busuk;
    const totalMasak = Math.max(0, totalJanjang - totalTidakMasak);

    const pcts = {
      mentah: pct(mentah, totalJanjang),
      mengkal: pct(mengkal, totalJanjang),
      tankos: pct(tankos, totalJanjang),
      overripe: pct(overripe, totalJanjang),
      busuk: pct(busuk, totalJanjang),
      tangkaiPanjang: pct(tangkaiPanjang, totalJanjang),
      partheno: pct(partheno, totalJanjang),
      makanTikus: pct(makanTikus, totalJanjang),
      masak: pct(totalMasak, totalJanjang),
      tidakMasak: pct(totalTidakMasak, totalJanjang)
    };

    const cuts = {
      mentah: pcts.mentah * settings.mentahCut / 100,
      mengkal: pcts.mengkal * settings.mengkalCut / 100,
      tankos: pcts.tankos * settings.tankosCut / 100,
      overripe: pcts.overripe > settings.overripeTolerance ? (pcts.overripe - settings.overripeTolerance) * settings.overripeCut / 100 : 0,
      busuk: pcts.busuk * settings.busukCut / 100,
      tangkaiPanjang: pcts.tangkaiPanjang * settings.tangkaiCut / 100,
      partheno: pcts.partheno * settings.parthenoCut / 100,
      makanTikus: pcts.makanTikus * settings.makanTikusCut / 100
    };

    const totalCut = settings.baseCut + Object.values(cuts).reduce((sum, value) => sum + value, 0);

    return {
      totalJanjang,
      mentah,
      mengkal,
      tankos,
      overripe,
      busuk,
      tangkaiPanjang,
      partheno,
      makanTikus,
      totalTidakMasak,
      totalMasak,
      pcts,
      cuts,
      baseCut: settings.baseCut,
      totalCut,
      status: qualityStatus(totalCut)
    };
  }

  function calculateTeneraDura(values) {
    const tenera = Math.max(0, Number(values.tenera || 0));
    const dura = Math.max(0, Number(values.dura || 0));
    const totalSample = tenera + dura;
    const pctTenera = pct(tenera, totalSample);
    const pctDura = pct(dura, totalSample);
    return {
      tenera,
      dura,
      totalSample,
      pctTenera,
      pctDura,
      status: tdStatus(pctTenera, pctDura)
    };
  }

  function calculateGradingPreview() {
    const form = byId("gradingForm");
    const values = getGradingFormValues(form);
    const result = calculateGrading(values);

    Object.keys(CATEGORY_LABELS).forEach((cat) => {
      const row = $(`#gradingInputTable tr[data-cat="${cat}"]`);
      if (row) {
        $(".pct", row).textContent = formatPct(result.pcts[cat]);
        $(".cut", row).textContent = formatPct(result.cuts[cat]);
      }
    });

    byId("gradingResultList").innerHTML = resultListHtml([
      ["Total janjang", formatNumber(result.totalJanjang)],
      ["Total masak", `${formatNumber(result.totalMasak)} (${formatPct(result.pcts.masak)})`],
      ["Total tidak masak", `${formatNumber(result.totalTidakMasak)} (${formatPct(result.pcts.tidakMasak)})`],
      ["Potongan dasar", formatPct(result.baseCut)],
      ["Potongan mentah", formatPct(result.cuts.mentah)],
      ["Potongan mengkal", formatPct(result.cuts.mengkal)],
      ["Potongan tankos", formatPct(result.cuts.tankos)],
      ["Potongan overripe", formatPct(result.cuts.overripe)],
      ["Potongan busuk", formatPct(result.cuts.busuk)],
      ["Potongan tangkai panjang", formatPct(result.cuts.tangkaiPanjang)],
      ["Potongan partheno", formatPct(result.cuts.partheno)],
      ["Potongan makan tikus", formatPct(result.cuts.makanTikus)],
      ["Total potongan akhir", formatPct(result.totalCut)],
      ["Status kualitas", statusBadge(result.status)]
    ]);
  }

  function calculateTdPreview() {
    const form = byId("tdForm");
    const result = calculateTeneraDura({ tenera: getNumber(form, "tenera"), dura: getNumber(form, "dura") });
    byId("tdResultList").innerHTML = resultListHtml([
      ["Total sampel", formatNumber(result.totalSample)],
      ["Tenera", `${formatNumber(result.tenera)} (${formatPct(result.pctTenera)})`],
      ["Dura", `${formatNumber(result.dura)} (${formatPct(result.pctDura)})`],
      ["Status komposisi", statusBadge(result.status)]
    ]);
  }

  function getGradingFormValues(form) {
    return {
      totalJanjang: getNumber(form, "totalJanjang"),
      mentah: getNumber(form, "mentah"),
      mengkal: getNumber(form, "mengkal"),
      tankos: getNumber(form, "tankos"),
      overripe: getNumber(form, "overripe"),
      busuk: getNumber(form, "busuk"),
      tangkaiPanjang: getNumber(form, "tangkaiPanjang"),
      partheno: getNumber(form, "partheno"),
      makanTikus: getNumber(form, "makanTikus")
    };
  }

  function saveGradingFromForm(makeReport) {
    const form = byId("gradingForm");
    const values = getGradingFormValues(form);
    const result = calculateGrading(values);
    const validation = validateGradingForm(form, result);
    if (!validation.ok) {
      toast(validation.message, true);
      return null;
    }

    const record = {
      id: nextTransactionId("GRD", getText(form, "date")),
      date: getText(form, "date"),
      time: currentTimeString(),
      spk: getText(form, "spk"),
      driver: getText(form, "driver"),
      plate: getText(form, "plate").toUpperCase(),
      supplier: getText(form, "supplier"),
      ticket: getText(form, "ticket"),
      officer: getText(form, "officer"),
      note: getText(form, "note"),
      ...result,
      createdBy: getText(form, "officer") || "Operator",
      createdAt: new Date().toISOString(),
      updatedBy: "",
      updatedAt: ""
    };

    state.grading.push(record);
    upsertDriver(record.driver, record.plate, record.supplier);
    addAuditLog("grading", record.id, "tambah", null, record);
    saveAll();
    setFirestoreDoc("grading", record);
    setFirestoreDoc("drivers", state.drivers.find((item) => item.name.toLowerCase() === record.driver.toLowerCase()));
    form.reset();
    form.elements.date.value = todayString();
    calculateGradingPreview();
    renderAll();
    toast("Data grading berhasil disimpan.");
    openPostSaveModal("grading", record);

    if (makeReport) reportSingleGrading(record.id);
    return record;
  }

  function saveTdFromForm(makeReport) {
    const form = byId("tdForm");
    const result = calculateTeneraDura({ tenera: getNumber(form, "tenera"), dura: getNumber(form, "dura") });
    const validation = validateTdForm(form, result);
    if (!validation.ok) {
      toast(validation.message, true);
      return null;
    }

    const record = {
      id: nextTransactionId("TD", getText(form, "date")),
      date: getText(form, "date"),
      time: currentTimeString(),
      spk: getText(form, "spk"),
      driver: getText(form, "driver"),
      plate: getText(form, "plate").toUpperCase(),
      supplier: getText(form, "supplier"),
      ticket: getText(form, "ticket"),
      officer: getText(form, "officer"),
      note: getText(form, "note"),
      ...result,
      createdBy: getText(form, "officer") || "Operator",
      createdAt: new Date().toISOString(),
      updatedBy: "",
      updatedAt: ""
    };

    state.td.push(record);
    upsertDriver(record.driver, record.plate, record.supplier);
    addAuditLog("td", record.id, "tambah", null, record);
    saveAll();
    setFirestoreDoc("td", record);
    setFirestoreDoc("drivers", state.drivers.find((item) => item.name.toLowerCase() === record.driver.toLowerCase()));
    form.reset();
    form.elements.date.value = todayString();
    calculateTdPreview();
    renderAll();
    toast("Data tenera dura berhasil disimpan.");
    openPostSaveModal("td", record);

    if (makeReport) reportSingleTd(record.id);
    return record;
  }

  function validateGradingForm(form, result) {
    if (!getText(form, "date")) return { ok: false, message: "Tanggal wajib diisi." };
    if (!getText(form, "driver")) return { ok: false, message: "Nama sopir wajib diisi." };
    if (!getText(form, "plate")) return { ok: false, message: "Nomor polisi wajib diisi." };
    if (!getText(form, "supplier")) return { ok: false, message: "Supplier wajib dipilih." };
    if (result.totalJanjang <= 0) return { ok: false, message: "Total janjang harus lebih dari 0." };
    if (result.totalTidakMasak > result.totalJanjang) return { ok: false, message: "Jumlah grading utama melebihi total janjang." };
    return { ok: true };
  }

  function validateTdForm(form, result) {
    if (!getText(form, "date")) return { ok: false, message: "Tanggal wajib diisi." };
    if (!getText(form, "driver")) return { ok: false, message: "Nama sopir wajib diisi." };
    if (!getText(form, "plate")) return { ok: false, message: "Nomor polisi wajib diisi." };
    if (!getText(form, "supplier")) return { ok: false, message: "Supplier wajib dipilih." };
    if (result.totalSample <= 0) return { ok: false, message: "Total sampel tenera dan dura harus lebih dari 0." };
    return { ok: true };
  }

  function applyDriverAutofill(form) {
    const driverName = getText(form, "driver").toLowerCase();
    if (!driverName) return;
    const driver = state.drivers.find((item) => item.name.toLowerCase() === driverName);
    if (!driver) return;
    const plateField = form.elements.plate;
    const supplierField = form.elements.supplier;
    if (driver.plate) plateField.value = driver.plate;
    if (driver.supplier) supplierField.value = driver.supplier;
  }

  function upsertDriver(name, plate, supplier) {
    const normalized = name.trim().toLowerCase();
    let driver = state.drivers.find((item) => item.name.toLowerCase() === normalized);
    if (!driver) {
      driver = { id: makeId("DRV"), name: name.trim(), plate: plate || "", supplier: supplier || "", createdAt: new Date().toISOString(), updatedAt: "" };
      state.drivers.push(driver);
    } else {
      driver.plate = plate || driver.plate;
      driver.supplier = supplier || driver.supplier;
      driver.updatedAt = new Date().toISOString();
    }
  }


  function transactionActionsHtml(type, id) {
    const suffix = type === "grading" ? "grading" : "td";
    const buttons = [
      `<button class="btn btn-outline" data-action="detail-${suffix}" data-id="${id}">Detail</button>`,
      `<button class="btn btn-outline" data-action="wa-${suffix}" data-id="${id}">WA</button>`,
      `<button class="btn btn-secondary" data-action="jpg-${suffix}" data-id="${id}">Download JPG</button>`,
      `<button class="btn btn-primary" data-action="share-jpg-${suffix}" data-id="${id}">Share WA</button>`
    ];
    if (isStaff()) {
      buttons.push(`<button class="btn btn-secondary" data-action="edit-${suffix}" data-id="${id}">Edit</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="delete-${suffix}" data-id="${id}">Hapus</button>`);
    }
    return `<div class="row-actions">${buttons.join("")}</div>`;
  }

  function openPostSaveModal(type, record) {
    const isGrading = type === "grading";
    const title = isGrading ? "Data Grading Berhasil Disimpan" : "Data Tenera Dura Berhasil Disimpan";
    const bodyRows = isGrading
      ? [["ID", record.id], ["SPK", record.spk || "-"], ["Sopir", record.driver], ["Supplier", record.supplier], ["Total janjang", formatNumber(record.totalJanjang)], ["Total potongan", formatPct(record.totalCut)]]
      : [["ID", record.id], ["SPK", record.spk || "-"], ["Sopir", record.driver], ["Supplier", record.supplier], ["Total sampel", formatNumber(record.totalSample)], ["Tenera", formatPct(record.pctTenera)], ["Dura", formatPct(record.pctDura)]];
    const actionSuffix = isGrading ? "grading" : "td";
    openModal(title, detailGridHtml(bodyRows), `<button class="btn btn-outline" data-close-modal>Tutup</button><button class="btn btn-primary" data-action="wa-${actionSuffix}" data-id="${record.id}">Buat Laporan WA</button><button class="btn btn-secondary" data-action="preview-jpg-${actionSuffix}" data-id="${record.id}">Preview JPG</button><button class="btn btn-primary" data-action="download-jpg-${actionSuffix}" data-id="${record.id}">Download JPG</button><button class="btn btn-primary" data-action="share-download-jpg-${actionSuffix}" data-id="${record.id}">Download & Share WA</button>`);
  }

  function getRecordByType(type, id) {
    return type === "grading" ? state.grading.find((item) => item.id === id) : state.td.find((item) => item.id === id);
  }

  function openJpgPreview(type, id) {
    const record = getRecordByType(type, id);
    if (!record) return;
    const suffix = type === "grading" ? "grading" : "td";
    const html = `<div class="jpg-preview-wrap">${type === "grading" ? buildGradingJpgReport(record) : buildTdJpgReport(record)}</div>`;
    openModal(type === "grading" ? "Preview JPG Grading" : "Preview JPG Tenera Dura", html, `<button class="btn btn-outline" data-close-modal>Tutup</button><button class="btn btn-secondary" data-action="wa-${suffix}" data-id="${id}">Buat WA</button><button class="btn btn-primary" data-action="download-jpg-${suffix}" data-id="${id}">Download JPG</button><button class="btn btn-primary" data-action="share-download-jpg-${suffix}" data-id="${id}">Download & Share WA</button>`);
  }

  async function downloadRecordJpg(type, id, options = {}) {
    const record = getRecordByType(type, id);
    if (!record) return;
    const host = byId("jpgReportHost") || document.body;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = type === "grading" ? buildGradingJpgReport(record) : buildTdJpgReport(record);
    const element = wrapper.firstElementChild;
    host.appendChild(element);
    const fileName = makeJpgFileName(type, record);
    const result = await generateJpgFromElement(element, fileName);
    element.remove();
    if (result && (options.shareAfter || options.openWhatsApp)) {
      await shareJpgReportToWhatsapp(type, record, result.blob, fileName);
    }
  }

  function makeJpgFileName(type, record) {
    const base = type === "grading" ? "Laporan_Grading" : "Laporan_Tenera_Dura";
    const key = slugify(record.spk || record.id || "laporan");
    return `${base}_${record.date || todayString()}_${key}.jpg`;
  }

  async function generateJpgFromElement(element, fileName) {
    if (!window.html2canvas) {
      alert("Library export JPG belum tersedia. Periksa koneksi internet.");
      return null;
    }
    try {
      const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2, useCORS: true, scrollX: 0, scrollY: 0 });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = fileName;
        link.click();
      }
      toast("JPG berhasil didownload.");
      return { blob, dataUrl, fileName };
    } catch (error) {
      console.error(error);
      toast("Gagal membuat JPG.", true);
      return null;
    }
  }

  async function shareBlobToWhatsapp(title, text, blob, fileName) {
    try {
      if (blob && typeof File !== "undefined" && navigator.canShare && navigator.share) {
        const file = new File([blob], fileName, { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file] });
          toast("Pilih WhatsApp lalu pilih kontak atau grup tujuan. JPG sudah disiapkan.");
          return true;
        }
      }
    } catch (error) {
      console.warn("Share file dibatalkan/gagal:", error);
      return false;
    }

    toast("Perangkat/browser belum mendukung share gambar otomatis. File JPG sudah terdownload, silakan kirim manual melalui WhatsApp.", true);
    return false;
  }

  async function shareJpgReportToWhatsapp(type, record, blob, fileName) {
    const reportText = type === "grading" ? formatGradingTransactionReport(record) : formatTdTransactionReport(record);
    const text = `${reportText}

File JPG: ${fileName}`;
    const title = type === "grading" ? "Laporan Grading TBS" : "Laporan Tenera Dura";
    await shareBlobToWhatsapp(title, text, blob, fileName);
  }

  function previewReportJpgFromFilters(mode = "preview") {
    const module = byId("reportModule")?.value || "grading";
    const filters = getReportFilters();
    const data = module === "grading" ? filterTransactions(state.grading, filters) : filterTransactions(state.td, filters);
    if (!data.length) {
      toast("Tidak ada data untuk laporan JPG sesuai filter.", true);
      return;
    }
    const record = data[0];
    if (mode === "download") downloadRecordJpg(module, record.id, { shareAfter: false });
    else if (mode === "share") downloadRecordJpg(module, record.id, { shareAfter: true });
    else openJpgPreview(module, record.id);
  }

  function getDailyJpgConfig() {
    return {
      module: byId("dailyJpgModule")?.value || "grading",
      date: byId("dailyJpgDate")?.value || todayString(),
      group: byId("dailyJpgGroup")?.value || "overall",
      supplier: byId("dailyJpgSupplier")?.value || "",
      driver: (byId("dailyJpgDriver")?.value || "").trim()
    };
  }

  function getDailyJpgData(config) {
    let grading = filterByDate(state.grading, config.date, config.date);
    let td = filterByDate(state.td, config.date, config.date);
    if (config.supplier) {
      grading = grading.filter((row) => row.supplier === config.supplier);
      td = td.filter((row) => row.supplier === config.supplier);
    }
    if (config.driver) {
      const driver = config.driver.toLowerCase();
      grading = grading.filter((row) => String(row.driver || "").toLowerCase().includes(driver));
      td = td.filter((row) => String(row.driver || "").toLowerCase().includes(driver));
    }
    return { grading, td };
  }

  function openDailyJpgPreview() {
    const config = getDailyJpgConfig();
    const data = getDailyJpgData(config);
    if (!data.grading.length && !data.td.length) {
      toast("Tidak ada data harian sesuai pilihan.", true);
      return;
    }
    const html = `<div class="jpg-preview-wrap">${buildDailyJpgReport(config, data)}</div>`;
    openModal("Preview Rekap Harian JPG", html, `<button class="btn btn-outline" data-close-modal>Tutup</button><button class="btn btn-outline" id="downloadDailyJpgFromPreviewButton" type="button">Download JPG</button><button class="btn btn-primary" id="shareDailyJpgFromPreviewButton" type="button">Download & Share WA</button>`);
    byId("downloadDailyJpgFromPreviewButton")?.addEventListener("click", () => downloadDailyJpg(false));
    byId("shareDailyJpgFromPreviewButton")?.addEventListener("click", () => downloadDailyJpg(true));
  }

  async function downloadDailyJpg(openWhatsAppAfter = true) {
    const config = getDailyJpgConfig();
    const data = getDailyJpgData(config);
    if (!data.grading.length && !data.td.length) {
      toast("Tidak ada data harian sesuai pilihan.", true);
      return;
    }
    const host = byId("jpgReportHost") || document.body;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildDailyJpgReport(config, data);
    const element = wrapper.firstElementChild;
    host.appendChild(element);
    const fileName = makeDailyJpgFileName(config);
    const result = await generateJpgFromElement(element, fileName);
    element.remove();
    if (result && openWhatsAppAfter) {
      await shareDailyJpgToWhatsapp(config, data, result.blob, fileName);
    }
  }

  function makeDailyJpgFileName(config) {
    const moduleLabel = config.module === "td" ? "Tenera_Dura" : config.module === "combined" ? "Gabungan" : "Grading";
    const groupLabel = config.group === "supplier" ? "Per_Supplier" : config.group === "driver" ? "Per_Sopir" : "Semua";
    const filterKey = slugify(config.supplier || config.driver || "all");
    return `Rekap_Harian_${moduleLabel}_${groupLabel}_${config.date}_${filterKey}.jpg`;
  }

  async function shareDailyJpgToWhatsapp(config, data, blob, fileName) {
    const text = formatDailyJpgWhatsappText(config, data, fileName);
    await shareBlobToWhatsapp("Rekap Harian", text, blob, fileName);
  }

  function formatDailyJpgWhatsappText(config, data, fileName) {
    const g = overallGrading(data.grading);
    const t = overallTeneraDura(data.td);
    const lines = [
      COMPANY_NAME,
      "REKAP TRANSAKSI HARIAN",
      `Tanggal: ${formatDate(config.date)}`,
      `Jenis: ${config.module === "td" ? "Tenera Dura" : config.module === "combined" ? "Gabungan" : "Grading TBS"}`,
      `Rincian: ${config.group === "supplier" ? "Per Supplier" : config.group === "driver" ? "Per Sopir" : "Semua Data"}`
    ];
    if (config.supplier) lines.push(`Supplier: ${config.supplier}`);
    if (config.driver) lines.push(`Sopir: ${config.driver}`);
    if (config.module !== "td") {
      lines.push("", "GRADING TBS", `Transaksi: ${formatNumber(data.grading.length)}`, `Total Janjang: ${formatNumber(g.totalJanjang)}`, `Masak: ${formatNumber(g.totalMasak)} (${formatPct(g.pctMasak)})`, `Tidak Masak: ${formatNumber(g.totalTidakMasak)} (${formatPct(g.pctTidakMasak)})`, `Rata-rata Potongan: ${formatPct(g.avgTotalCut)}`);
    }
    if (config.module !== "grading") {
      lines.push("", "TENERA DURA", `Transaksi: ${formatNumber(data.td.length)}`, `Total Sampel: ${formatNumber(t.totalSample)}`, `Tenera: ${formatNumber(t.totalTenera)} (${formatPct(t.pctTenera)})`, `Dura: ${formatNumber(t.totalDura)} (${formatPct(t.pctDura)})`);
    }
    lines.push("", `File JPG otomatis didownload: ${fileName}`);
    return lines.join("\n");
  }

  function getActiveDataJpgConfig() {
    const activeModule = byId("tdDataTab")?.classList.contains("active") ? "td" : "grading";
    const filters = getDateFilterFromControls("data");
    const supplier = byId("dataSupplier")?.value || "";
    const search = (byId("dataSearch")?.value || "").trim();
    return { module: activeModule, filters, supplier, search };
  }

  function getActiveDataJpgRecords(config) {
    const filtered = getFilteredData();
    return config.module === "td" ? filtered.td : filtered.grading;
  }

  function openDataFilteredJpgPreview() {
    const config = getActiveDataJpgConfig();
    const records = getActiveDataJpgRecords(config);
    if (!records.length) {
      toast("Tidak ada data transaksi sesuai filter untuk JPG.", true);
      return;
    }
    const html = `<div class="jpg-preview-wrap">${buildFilteredTransactionsJpgReport(config, records)}</div>`;
    openModal("Preview JPG Data Transaksi", html, `<button class="btn btn-outline" data-close-modal>Tutup</button><button class="btn btn-outline" id="downloadDataJpgFromPreviewButton" type="button">Download JPG</button><button class="btn btn-primary" id="shareDataJpgFromPreviewButton" type="button">Download & Share WA</button>`);
    byId("downloadDataJpgFromPreviewButton")?.addEventListener("click", () => downloadDataFilteredJpg(false));
    byId("shareDataJpgFromPreviewButton")?.addEventListener("click", () => downloadDataFilteredJpg(true));
  }

  async function downloadDataFilteredJpg(shareAfter = false) {
    const config = getActiveDataJpgConfig();
    const records = getActiveDataJpgRecords(config);
    if (!records.length) {
      toast("Tidak ada data transaksi sesuai filter untuk JPG.", true);
      return;
    }
    const host = byId("jpgReportHost") || document.body;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildFilteredTransactionsJpgReport(config, records);
    const element = wrapper.firstElementChild;
    host.appendChild(element);
    const fileName = makeFilteredDataJpgFileName(config);
    const result = await generateJpgFromElement(element, fileName);
    element.remove();
    if (result && shareAfter) {
      const title = config.module === "td" ? "Data Transaksi Tenera Dura" : "Data Transaksi Grading TBS";
      const text = `${COMPANY_NAME}
${title}
Periode: ${periodText(config.filters)}
Total data: ${formatNumber(records.length)}
File JPG: ${fileName}`;
      await shareBlobToWhatsapp(title, text, result.blob, fileName);
    }
  }

  function makeFilteredDataJpgFileName(config) {
    const moduleLabel = config.module === "td" ? "Tenera_Dura" : "Grading";
    const filterKey = slugify(config.supplier || config.search || "semua");
    return `Data_Transaksi_${moduleLabel}_${filePeriodName(config.filters)}_${filterKey}.jpg`;
  }

  function buildFilteredTransactionsJpgReport(config, records) {
    const isTd = config.module === "td";
    const title = isTd ? "Data Transaksi Tenera Dura" : "Data Transaksi Grading TBS";
    const meta = `${periodText(config.filters)}${config.supplier ? ` | Supplier: ${config.supplier}` : ""}${config.search ? ` | Pencarian: ${config.search}` : ""}`;
    const summary = isTd ? buildFilteredTdSummary(records) : buildFilteredGradingSummary(records);
    const table = isTd ? buildFilteredTdTransactionsTable(records) : buildFilteredGradingTransactionsTable(records);
    return `<div class="jpg-report-card jpg-daily-report"><div class="jpg-report-header"><div class="header-brand"><span class="sawit-watermark">🌴</span><div><h2>${title}</h2><p>${COMPANY_NAME}</p></div></div><div><p>Periode: ${escapeHtml(periodText(config.filters))}</p><p>${escapeHtml(meta)}</p></div></div><div class="jpg-report-body"><div class="jpg-daily-meta">${jpgItem("Jenis", isTd ? "Tenera Dura" : "Grading TBS")}${jpgItem("Total Data", formatNumber(records.length))}${jpgItem("Supplier", config.supplier || "Semua")}${jpgItem("Filter", config.search || "-")}</div>${summary}${table}</div><div class="jpg-footer">Data transaksi dibuat otomatis melalui Sistem Grading TBS dan Tenera Dura - ${COMPANY_NAME}</div></div>`;
  }

  function buildFilteredGradingSummary(records) {
    const overall = overallGrading(records);
    const detail = dailyGradingTable([aggregateGradingFromRecords(records, "overall", "Total Filter")]);
    return `<h3 class="jpg-section-title">Ringkasan Kematangan & Potongan</h3><table class="jpg-daily-table"><tbody><tr><th>Transaksi</th><th>Total Janjang</th><th>Masak</th><th>Tidak Masak</th><th>Potongan Rata-rata</th><th>Status</th></tr><tr><td>${formatNumber(records.length)}</td><td>${formatNumber(overall.totalJanjang)}</td><td>${formatNumber(overall.totalMasak)}<span class="jpg-mini-note">${formatPct(overall.pctMasak)}</span></td><td>${formatNumber(overall.totalTidakMasak)}<span class="jpg-mini-note">${formatPct(overall.pctTidakMasak)}</span></td><td>${formatPct(overall.avgTotalCut)}</td><td>${escapeHtml(overall.status)}</td></tr></tbody></table>${detail}`;
  }

  function buildFilteredTdSummary(records) {
    const overall = overallTeneraDura(records);
    const detail = dailyTdTable([aggregateTdFromRecords(records, "overall", "Total Filter")]);
    return `<h3 class="jpg-section-title">Ringkasan Tenera Dura</h3><table class="jpg-daily-table"><tbody><tr><th>Transaksi</th><th>Total Sampel</th><th>Tenera</th><th>Dura</th><th>Status</th></tr><tr><td>${formatNumber(records.length)}</td><td>${formatNumber(overall.totalSample)}</td><td>${formatNumber(overall.totalTenera)}<span class="jpg-mini-note">${formatPct(overall.pctTenera)}</span></td><td>${formatNumber(overall.totalDura)}<span class="jpg-mini-note">${formatPct(overall.pctDura)}</span></td><td>${escapeHtml(overall.status)}</td></tr></tbody></table>${detail}`;
  }

  function buildFilteredGradingTransactionsTable(records) {
    return `<h3 class="jpg-section-title">Rincian Transaksi</h3><table class="jpg-daily-table"><thead><tr><th>Tanggal</th><th>SPK</th><th>Sopir</th><th>Plat</th><th>Supplier</th><th>Janjang</th><th>Masak</th><th>Tidak Masak</th><th>Potongan</th><th>Status</th></tr></thead><tbody>${records.map((r) => `<tr><td>${formatDate(r.date)}</td><td>${escapeHtml(r.spk || "-")}</td><td>${escapeHtml(r.driver || "-")}</td><td>${escapeHtml(r.plate || "-")}</td><td>${escapeHtml(r.supplier || "-")}</td><td>${formatNumber(r.totalJanjang)}</td><td>${formatNumber(r.totalMasak)}<span class="jpg-mini-note">${formatPct(r.pcts?.masak || 0)}</span></td><td>${formatNumber(r.totalTidakMasak)}<span class="jpg-mini-note">${formatPct(r.pcts?.tidakMasak || 0)}</span></td><td>${formatPct(r.totalCut)}</td><td>${escapeHtml(r.status || "-")}</td></tr>`).join("")}</tbody></table>`;
  }

  function buildFilteredTdTransactionsTable(records) {
    return `<h3 class="jpg-section-title">Rincian Transaksi</h3><table class="jpg-daily-table"><thead><tr><th>Tanggal</th><th>SPK</th><th>Sopir</th><th>Plat</th><th>Supplier</th><th>Sampel</th><th>Tenera</th><th>Dura</th><th>Status</th></tr></thead><tbody>${records.map((r) => `<tr><td>${formatDate(r.date)}</td><td>${escapeHtml(r.spk || "-")}</td><td>${escapeHtml(r.driver || "-")}</td><td>${escapeHtml(r.plate || "-")}</td><td>${escapeHtml(r.supplier || "-")}</td><td>${formatNumber(r.totalSample)}</td><td>${formatNumber(r.tenera)}<span class="jpg-mini-note">${formatPct(r.pctTenera)}</span></td><td>${formatNumber(r.dura)}<span class="jpg-mini-note">${formatPct(r.pctDura)}</span></td><td>${escapeHtml(r.status || "-")}</td></tr>`).join("")}</tbody></table>`;
  }

  function generateAnalysisWhatsappReport(module) {
    const filters = getDateFilterFromControls("analysis");
    const data = module === "td" ? filterByDate(state.td, filters.start, filters.end) : filterByDate(state.grading, filters.start, filters.end);
    if (!data.length) {
      toast("Tidak ada data sesuai filter Rekap & Analisa.", true);
      return;
    }
    let text = "";
    if (module === "td") {
      text = [
        formatOverallTdReport(data, filters),
        "\n--------------------------\n",
        "RINCIAN PER SUPPLIER",
        ...aggregateTdBy(data, "supplier").map((row) => formatSupplierTdReport(row, filters)),
        "\n--------------------------\n",
        "RINCIAN PER SOPIR",
        ...aggregateTdBy(data, "driver").map((row) => formatDriverTdReport(row, filters))
      ].join("\n\n");
      byId("reportModule").value = "td";
    } else {
      text = [
        formatOverallGradingReport(data, filters),
        "\n--------------------------\n",
        "RINCIAN PER SUPPLIER",
        ...aggregateGradingBy(data, "supplier").map((row) => formatSupplierGradingReport(row, filters)),
        "\n--------------------------\n",
        "RINCIAN PER SOPIR",
        ...aggregateGradingBy(data, "driver").map((row) => formatDriverGradingReport(row, filters))
      ].join("\n\n");
      byId("reportModule").value = "grading";
    }
    byId("reportOutput").value = text;
    showSection("reportSection");
    toast("Laporan WA dibuat dari filter Rekap & Analisa.");
  }

  function buildDailyJpgReport(config, data) {
    const title = config.module === "td" ? "Rekap Harian Tenera Dura" : config.module === "combined" ? "Rekap Harian Gabungan" : "Rekap Harian Grading TBS";
    const groupText = config.group === "supplier" ? "Per Supplier" : config.group === "driver" ? "Per Sopir" : "Semua Data";
    const subtitle = [groupText, config.supplier ? `Supplier: ${config.supplier}` : "", config.driver ? `Sopir: ${config.driver}` : ""].filter(Boolean).join(" | ");
    const gradingHtml = config.module !== "td" ? buildDailyGradingSection(data.grading, config) : "";
    const tdHtml = config.module !== "grading" ? buildDailyTdSection(data.td, config) : "";
    return `<div class="jpg-report-card jpg-daily-report"><div class="jpg-report-header"><div class="header-brand"><span class="sawit-watermark">🌴</span><div><h2>${title}</h2><p>${COMPANY_NAME}</p></div></div><div><p>Tanggal: ${formatDate(config.date)}</p><p>${escapeHtml(subtitle || "Semua data harian")}</p></div></div><div class="jpg-report-body"><div class="jpg-daily-meta">${jpgItem("Jenis Data", config.module === "td" ? "Tenera Dura" : config.module === "combined" ? "Gabungan" : "Grading TBS")}${jpgItem("Rincian", groupText)}${jpgItem("Supplier", config.supplier || "Semua")}${jpgItem("Sopir", config.driver || "Semua")}</div>${gradingHtml}${tdHtml}</div><div class="jpg-footer">Rekap harian dibuat otomatis melalui Sistem Grading TBS dan Tenera Dura - ${COMPANY_NAME}</div></div>`;
  }

  function buildDailyGradingSection(records, config) {
    const overall = overallGrading(records);
    const rows = getDailyGroupedRows(records, config, "grading");
    const overallTable = `<table class="jpg-daily-table"><tbody><tr><th>Transaksi</th><th>Total Janjang</th><th>Masak</th><th>Tidak Masak</th><th>Rata-rata Potongan</th><th>Status</th></tr><tr><td>${formatNumber(records.length)}</td><td>${formatNumber(overall.totalJanjang)}</td><td>${formatNumber(overall.totalMasak)}<span class="jpg-mini-note">${formatPct(overall.pctMasak)}</span></td><td>${formatNumber(overall.totalTidakMasak)}<span class="jpg-mini-note">${formatPct(overall.pctTidakMasak)}</span></td><td>${formatPct(overall.avgTotalCut)}</td><td>${escapeHtml(overall.status)}</td></tr></tbody></table>`;
    return `<h3 class="jpg-section-title">Grading TBS - Kematangan & Potongan</h3>${overallTable}${dailyGradingTable(rows)}`;
  }

  function buildDailyTdSection(records, config) {
    const overall = overallTeneraDura(records);
    const rows = getDailyGroupedRows(records, config, "td");
    const overallTable = `<table class="jpg-daily-table"><tbody><tr><th>Transaksi</th><th>Total Sampel</th><th>Tenera</th><th>Dura</th><th>Status</th></tr><tr><td>${formatNumber(records.length)}</td><td>${formatNumber(overall.totalSample)}</td><td>${formatNumber(overall.totalTenera)}<span class="jpg-mini-note">${formatPct(overall.pctTenera)}</span></td><td>${formatNumber(overall.totalDura)}<span class="jpg-mini-note">${formatPct(overall.pctDura)}</span></td><td>${escapeHtml(overall.status)}</td></tr></tbody></table>`;
    return `<h3 class="jpg-section-title">Tenera Dura - Komposisi Sampel</h3>${overallTable}${dailyTdTable(rows)}`;
  }

  function getDailyGroupedRows(records, config, type) {
    if (type === "grading") {
      if (config.group === "supplier") return aggregateGradingBy(records, "supplier");
      if (config.group === "driver") return aggregateGradingBy(records, "driver");
      return [aggregateGradingFromRecords(records, "overall", "Semua")];
    }
    if (config.group === "supplier") return aggregateTdBy(records, "supplier");
    if (config.group === "driver") return aggregateTdBy(records, "driver");
    return [aggregateTdFromRecords(records, "overall", "Semua")];
  }

  function dailyGroupName(row) {
    return row.supplier || row.driver || row.overall || "Semua";
  }

  function dailyGradingTable(rows) {
    if (!rows.length) return `<p class="empty-state">Tidak ada data grading pada tanggal ini.</p>`;
    return `<table class="jpg-daily-table"><thead><tr><th>Rincian</th><th>Trx</th><th>Janjang</th><th>Masak</th><th>Tidak Masak</th><th>Mentah</th><th>Mengkal</th><th>Tankos</th><th>Overripe</th><th>Busuk</th><th>Tangkai</th><th>Partheno</th><th>Tikus</th><th>Pot. Dasar</th><th>Pot. Akhir</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHtml(dailyGroupName(r))}</td><td>${formatNumber(r.count)}</td><td>${formatNumber(r.totalJanjang)}</td><td>${formatNumber(r.totalMasak)}<span class="jpg-mini-note">${formatPct(r.pctMasak)}</span></td><td>${formatNumber(r.totalTidakMasak)}<span class="jpg-mini-note">${formatPct(r.pctTidakMasak)}</span></td>${dailyCatCell(r.mentah, r.pctMentah, r.avgCutMentah)}${dailyCatCell(r.mengkal, r.pctMengkal, r.avgCutMengkal)}${dailyCatCell(r.tankos, r.pctTankos, r.avgCutTankos)}${dailyCatCell(r.overripe, r.pctOverripe, r.avgCutOverripe)}${dailyCatCell(r.busuk, r.pctBusuk, r.avgCutBusuk)}${dailyCatCell(r.tangkaiPanjang, r.pctTangkaiPanjang, r.avgCutTangkaiPanjang)}${dailyCatCell(r.partheno, r.pctPartheno, r.avgCutPartheno)}${dailyCatCell(r.makanTikus, r.pctMakanTikus, r.avgCutMakanTikus)}<td>${formatPct(r.avgBaseCut)}</td><td><strong>${formatPct(r.avgTotalCut)}</strong><span class="jpg-mini-note">Max ${formatPct(r.maxCut)} | Min ${formatPct(r.minCut)}</span></td><td>${escapeHtml(r.status)}</td></tr>`).join("")}</tbody></table>`;
  }

  function dailyCatCell(total, pctValue, cutValue) {
    return `<td>${formatNumber(total)}<span class="jpg-mini-note">${formatPct(pctValue)} | Pot ${formatPct(cutValue)}</span></td>`;
  }

  function dailyTdTable(rows) {
    if (!rows.length) return `<p class="empty-state">Tidak ada data tenera dura pada tanggal ini.</p>`;
    return `<table class="jpg-daily-table"><thead><tr><th>Rincian</th><th>Trx</th><th>Total Sampel</th><th>Tenera</th><th>Dura</th><th>Tenera Max/Min</th><th>Dura Max/Min</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHtml(dailyGroupName(r))}</td><td>${formatNumber(r.count)}</td><td>${formatNumber(r.totalSample)}</td><td>${formatNumber(r.totalTenera)}<span class="jpg-mini-note">${formatPct(r.pctTenera)}</span></td><td>${formatNumber(r.totalDura)}<span class="jpg-mini-note">${formatPct(r.pctDura)}</span></td><td>${formatPct(r.maxTenera)} / ${formatPct(r.minTenera)}</td><td>${formatPct(r.maxDura)} / ${formatPct(r.minDura)}</td><td>${escapeHtml(r.status)}</td></tr>`).join("")}</tbody></table>`;
  }

  function buildGradingJpgReport(row) {
    const rows = Object.keys(CATEGORY_LABELS).map((cat) => `<tr><td>${escapeHtml(CATEGORY_LABELS[cat])}</td><td>${formatNumber(row[cat] || 0)}</td><td>${formatPct(row.pcts?.[cat] || 0)}</td><td>${formatPct(row.cuts?.[cat] || 0)}</td></tr>`).join("");
    return `<div class="jpg-report-card"><div class="jpg-report-header"><div class="header-brand"><span class="sawit-watermark">🌴</span><div><h2>Laporan Grading TBS</h2><p>${COMPANY_NAME}</p></div></div><div><p>ID: ${escapeHtml(row.id)}</p><p>SPK: ${escapeHtml(row.spk || "-")}</p></div></div><div class="jpg-report-body"><div class="jpg-report-grid">${jpgItem("Tanggal", formatDate(row.date))}${jpgItem("Jam", row.time || "-")}${jpgItem("Sopir", row.driver)}${jpgItem("Nomor Polisi", row.plate)}${jpgItem("Supplier", row.supplier)}${jpgItem("Tiket/DO", row.ticket || "-")}${jpgItem("Petugas", row.officer || "-")}${jpgItem("Status", row.status)}</div><table class="jpg-report-table"><thead><tr><th>Kategori</th><th>Jumlah</th><th>Persentase</th><th>Potongan</th></tr></thead><tbody>${rows}</tbody></table><div class="jpg-total-box"><div><span>Total Janjang</span><strong>${formatNumber(row.totalJanjang)}</strong></div><div><span>Total Masak</span><strong>${formatNumber(row.totalMasak)} (${formatPct(row.pcts?.masak || 0)})</strong></div><div><span>Total Potongan</span><strong>${formatPct(row.totalCut)}</strong></div><div><span>Tidak Masak</span><strong>${formatNumber(row.totalTidakMasak)} (${formatPct(row.pcts?.tidakMasak || 0)})</strong></div><div><span>Potongan Dasar</span><strong>${formatPct(row.baseCut)}</strong></div><div><span>Status</span><strong>${escapeHtml(row.status)}</strong></div></div>${row.note ? `<p class="muted"><strong>Catatan:</strong> ${escapeHtml(row.note)}</p>` : ""}</div><div class="jpg-footer">Dibuat melalui Sistem Grading TBS dan Tenera Dura - ${COMPANY_NAME}</div></div>`;
  }

  function buildTdJpgReport(row) {
    return `<div class="jpg-report-card"><div class="jpg-report-header"><div class="header-brand"><span class="sawit-watermark">🌴</span><div><h2>Laporan Tenera Dura</h2><p>${COMPANY_NAME}</p></div></div><div><p>ID: ${escapeHtml(row.id)}</p><p>SPK: ${escapeHtml(row.spk || "-")}</p></div></div><div class="jpg-report-body"><div class="jpg-report-grid">${jpgItem("Tanggal", formatDate(row.date))}${jpgItem("Jam", row.time || "-")}${jpgItem("Sopir", row.driver)}${jpgItem("Nomor Polisi", row.plate)}${jpgItem("Supplier", row.supplier)}${jpgItem("Tiket/DO", row.ticket || "-")}${jpgItem("Petugas", row.officer || "-")}${jpgItem("Status", row.status)}</div><table class="jpg-report-table"><thead><tr><th>Sampel</th><th>Jumlah</th><th>Persentase</th></tr></thead><tbody><tr><td>Tenera</td><td>${formatNumber(row.tenera)}</td><td>${formatPct(row.pctTenera)}</td></tr><tr><td>Dura</td><td>${formatNumber(row.dura)}</td><td>${formatPct(row.pctDura)}</td></tr></tbody></table><div class="jpg-total-box"><div><span>Total Sampel</span><strong>${formatNumber(row.totalSample)}</strong></div><div><span>Tenera</span><strong>${formatPct(row.pctTenera)}</strong></div><div><span>Dura</span><strong>${formatPct(row.pctDura)}</strong></div></div>${row.note ? `<p class="muted"><strong>Catatan:</strong> ${escapeHtml(row.note)}</p>` : ""}</div><div class="jpg-footer">Dibuat melalui Sistem Grading TBS dan Tenera Dura - ${COMPANY_NAME}</div></div>`;
  }

  function jpgItem(label, value) {
    return `<div class="jpg-report-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "-")}</strong></div>`;
  }

  function renderDashboard() {
    const filters = getDateFilterFromControls("dashboard");
    const grading = filterByDate(state.grading, filters.start, filters.end);
    const td = filterByDate(state.td, filters.start, filters.end);
    const overallG = overallGrading(grading);
    const overallTd = overallTeneraDura(td);
    const supplierG = aggregateGradingBy(grading, "supplier");
    const supplierTd = aggregateTdBy(td, "supplier");
    const driverG = aggregateGradingBy(grading, "driver");
    const driverTd = aggregateTdBy(td, "driver");

    byId("dashboardCards").innerHTML = summaryCards([
      ["Pengiriman grading", formatNumber(grading.length), periodLabel(filters)],
      ["Total janjang", formatNumber(overallG.totalJanjang), "Grading TBS"],
      ["Masak rata-rata", formatPct(overallG.pctMasak), `${formatNumber(overallG.totalMasak)} janjang`],
      ["Potongan rata-rata", formatPct(overallG.avgTotalCut), statusText(overallG.status)],
      ["Input tenera dura", formatNumber(td.length), periodLabel(filters)],
      ["Total sampel", formatNumber(overallTd.totalSample), "Tenera + Dura"],
      ["Tenera rata-rata", formatPct(overallTd.pctTenera), `${formatNumber(overallTd.totalTenera)} sampel`],
      ["Dura rata-rata", formatPct(overallTd.pctDura), `${formatNumber(overallTd.totalDura)} sampel`]
    ]);

    const bestSupplier = minBy(supplierG, "avgTotalCut");
    const worstSupplier = maxBy(supplierG, "avgTotalCut");
    const bestDriver = minBy(driverG, "avgTotalCut");
    const worstDriver = maxBy(driverG, "avgTotalCut");

    byId("dashboardGradingHighlights").innerHTML = miniList([
      ["Supplier kualitas terbaik", bestSupplier ? `${bestSupplier.supplier} (${formatPct(bestSupplier.avgTotalCut)})` : "-"],
      ["Supplier potongan tertinggi", worstSupplier ? `${worstSupplier.supplier} (${formatPct(worstSupplier.avgTotalCut)})` : "-"],
      ["Sopir kualitas terbaik", bestDriver ? `${bestDriver.driver} (${formatPct(bestDriver.avgTotalCut)})` : "-"],
      ["Sopir potongan tertinggi", worstDriver ? `${worstDriver.driver} (${formatPct(worstDriver.avgTotalCut)})` : "-"],
      ["Total masak", categorySummaryText(overallG.totalMasak, overallG.pctMasak)],
      ["Total tidak masak", categorySummaryText(overallG.totalTidakMasak, overallG.pctTidakMasak)],
      ["Mentah", categorySummaryText(overallG.mentah, overallG.pctMentah)],
      ["Mengkal", categorySummaryText(overallG.mengkal, overallG.pctMengkal)],
      ["Tankos", categorySummaryText(overallG.tankos, overallG.pctTankos)],
      ["Overripe", categorySummaryText(overallG.overripe, overallG.pctOverripe)],
      ["Busuk", categorySummaryText(overallG.busuk, overallG.pctBusuk)],
      ["Tangkai panjang", categorySummaryText(overallG.tangkaiPanjang, overallG.pctTangkaiPanjang)],
      ["Partheno", categorySummaryText(overallG.partheno, overallG.pctPartheno)],
      ["Makan tikus", categorySummaryText(overallG.makanTikus, overallG.pctMakanTikus)],
      ["Status keseluruhan", statusBadge(overallG.status)]
    ]);

    const bestTeneraSupplier = maxBy(supplierTd, "pctTenera");
    const highDuraSupplier = maxBy(supplierTd, "pctDura");
    const bestTeneraDriver = maxBy(driverTd, "pctTenera");
    const highDuraDriver = maxBy(driverTd, "pctDura");

    byId("dashboardTdHighlights").innerHTML = miniList([
      ["Supplier tenera tertinggi", bestTeneraSupplier ? `${bestTeneraSupplier.supplier} (${formatPct(bestTeneraSupplier.pctTenera)})` : "-"],
      ["Supplier dura tertinggi", highDuraSupplier ? `${highDuraSupplier.supplier} (${formatPct(highDuraSupplier.pctDura)})` : "-"],
      ["Sopir tenera tertinggi", bestTeneraDriver ? `${bestTeneraDriver.driver} (${formatPct(bestTeneraDriver.pctTenera)})` : "-"],
      ["Sopir dura tertinggi", highDuraDriver ? `${highDuraDriver.driver} (${formatPct(highDuraDriver.pctDura)})` : "-"],
      ["Status komposisi", statusBadge(overallTd.status)]
    ]);

    renderBarChart(byId("gradingSupplierChart"), supplierG.map((row) => ({ label: row.supplier, value: row.avgTotalCut, display: formatPct(row.avgTotalCut) })), "avgTotalCut");
    renderBarChart(byId("tdSupplierChart"), supplierTd.map((row) => ({ label: row.supplier, value: row.pctTenera, display: formatPct(row.pctTenera) })), "pctTenera");
  }

  function renderDataTables() {
    const filtered = getFilteredData();
    renderGradingDataTable(filtered.grading);
    renderTdDataTable(filtered.td);
  }

  function getFilteredData() {
    const filters = getDateFilterFromControls("data");
    const search = (byId("dataSearch").value || "").trim().toLowerCase();
    const supplier = byId("dataSupplier").value || "";
    return {
      grading: filterTransactions(state.grading, { ...filters, search, supplier }),
      td: filterTransactions(state.td, { ...filters, search, supplier })
    };
  }

  function filterTransactions(data, filter) {
    return data.filter((item) => {
      const dateOk = isDateInRange(item.date, filter.start, filter.end);
      const supplierOk = !filter.supplier || item.supplier === filter.supplier;
      const driverOk = !filter.driver || item.driver.toLowerCase().includes(filter.driver.toLowerCase());
      const plateOk = !filter.plate || item.plate.toLowerCase().includes(filter.plate.toLowerCase());
      const searchText = `${item.id} ${item.date} ${item.spk || ""} ${item.driver} ${item.plate} ${item.supplier} ${item.ticket || ""}`.toLowerCase();
      const searchOk = !filter.search || searchText.includes(filter.search);
      return dateOk && supplierOk && driverOk && plateOk && searchOk;
    });
  }

  function renderGradingDataTable(data) {
    const table = byId("gradingDataTable");
    if (!data.length) {
      table.innerHTML = emptyTable("Belum ada data grading sesuai filter.");
      return;
    }
    table.innerHTML = `
      <thead><tr>
        <th>ID</th><th>Tanggal</th><th>SPK</th><th>Sopir</th><th>Plat</th><th>Supplier</th><th>Total Janjang</th><th>Total Masak</th><th>% Masak</th><th>Tidak Masak</th><th>Potongan</th><th>Status</th><th>Aksi</th>
      </tr></thead>
      <tbody>
        ${data.map((row) => `
          <tr>
            <td>${escapeHtml(row.id)}</td>
            <td>${formatDate(row.date)}<br><small>${escapeHtml(row.time || "")}</small></td>
            <td>${escapeHtml(row.spk || "-")}</td>
            <td>${escapeHtml(row.driver)}</td>
            <td>${escapeHtml(row.plate)}</td>
            <td>${escapeHtml(row.supplier)}</td>
            <td>${formatNumber(row.totalJanjang)}</td>
            <td>${formatNumber(row.totalMasak)}</td>
            <td>${formatPct(row.pcts?.masak)}</td>
            <td>${formatNumber(row.totalTidakMasak)}</td>
            <td><strong>${formatPct(row.totalCut)}</strong></td>
            <td>${statusBadge(row.status)}</td>
            <td>${transactionActionsHtml("grading", row.id)}</td>
          </tr>`).join("")}
      </tbody>`;
  }

  function renderTdDataTable(data) {
    const table = byId("tdDataTable");
    if (!data.length) {
      table.innerHTML = emptyTable("Belum ada data tenera dura sesuai filter.");
      return;
    }
    table.innerHTML = `
      <thead><tr>
        <th>ID</th><th>Tanggal</th><th>SPK</th><th>Sopir</th><th>Plat</th><th>Supplier</th><th>Total Sampel</th><th>Tenera</th><th>% Tenera</th><th>Dura</th><th>% Dura</th><th>Status</th><th>Aksi</th>
      </tr></thead>
      <tbody>
        ${data.map((row) => `
          <tr>
            <td>${escapeHtml(row.id)}</td>
            <td>${formatDate(row.date)}<br><small>${escapeHtml(row.time || "")}</small></td>
            <td>${escapeHtml(row.spk || "-")}</td>
            <td>${escapeHtml(row.driver)}</td>
            <td>${escapeHtml(row.plate)}</td>
            <td>${escapeHtml(row.supplier)}</td>
            <td>${formatNumber(row.totalSample)}</td>
            <td>${formatNumber(row.tenera)}</td>
            <td>${formatPct(row.pctTenera)}</td>
            <td>${formatNumber(row.dura)}</td>
            <td>${formatPct(row.pctDura)}</td>
            <td>${statusBadge(row.status)}</td>
            <td>${transactionActionsHtml("td", row.id)}</td>
          </tr>`).join("")}
      </tbody>`;
  }

  function renderAnalysis() {
    const filters = getDateFilterFromControls("analysis");
    const grading = filterByDate(state.grading, filters.start, filters.end);
    const td = filterByDate(state.td, filters.start, filters.end);
    const overallG = overallGrading(grading);
    const overallTd = overallTeneraDura(td);
    const supplierG = aggregateGradingBy(grading, "supplier");
    const supplierTd = aggregateTdBy(td, "supplier");
    const driverG = aggregateGradingBy(grading, "driver");
    const driverTd = aggregateTdBy(td, "driver");

    byId("analysisCards").innerHTML = summaryCards([
      ["Total pengiriman", formatNumber(grading.length), "Grading"],
      ["Total janjang", formatNumber(overallG.totalJanjang), "Grading"],
      ["% masak", formatPct(overallG.pctMasak), "Weighted average"],
      ["Potongan rata-rata", formatPct(overallG.avgTotalCut), statusText(overallG.status)],
      ["Input TD", formatNumber(td.length), "Tenera Dura"],
      ["Total sampel", formatNumber(overallTd.totalSample), "Tenera + Dura"],
      ["% Tenera", formatPct(overallTd.pctTenera), "Weighted average"],
      ["% Dura", formatPct(overallTd.pctDura), "Weighted average"]
    ]);

    byId("analysisOverallGrading").innerHTML = miniList(overallGradingRows(overallG));
    byId("analysisOverallTd").innerHTML = miniList(overallTdRows(overallTd));

    renderSimpleTable(byId("supplierGradingTable"), supplierGradingColumns(), supplierG.map(toSupplierGradingRow));
    renderSimpleTable(byId("supplierTdTable"), supplierTdColumns(), supplierTd.map(toSupplierTdRow));
    renderSimpleTable(byId("driverGradingTable"), driverGradingColumns(), driverG.map(toDriverGradingRow));
    renderSimpleTable(byId("driverTdTable"), driverTdColumns(), driverTd.map(toDriverTdRow));
    renderSimpleTable(byId("analysisAllGradingTable"), allGradingColumns(), grading.map(toAllGradingAnalysisRow));
    renderSimpleTable(byId("analysisAllTdTable"), allTdColumns(), td.map(toAllTdAnalysisRow));

    const topSupplierByVolume = maxBy(supplierG, "totalJanjang");
    const bestSupplier = minBy(supplierG, "avgTotalCut");
    const worstSupplier = maxBy(supplierG, "avgTotalCut");
    const topTeneraSupplier = maxBy(supplierTd, "pctTenera");
    const topDriverVolume = maxBy(driverG, "totalJanjang");
    const bestDriver = minBy(driverG, "avgTotalCut");
    const worstDriver = maxBy(driverG, "avgTotalCut");
    const topTeneraDriver = maxBy(driverTd, "pctTenera");

    byId("rankingSupplier").innerHTML = miniList([
      ["Volume janjang tertinggi", topSupplierByVolume ? `${topSupplierByVolume.supplier} (${formatNumber(topSupplierByVolume.totalJanjang)})` : "-"],
      ["Kualitas grading terbaik", bestSupplier ? `${bestSupplier.supplier} (${formatPct(bestSupplier.avgTotalCut)})` : "-"],
      ["Potongan tertinggi", worstSupplier ? `${worstSupplier.supplier} (${formatPct(worstSupplier.avgTotalCut)})` : "-"],
      ["Tenera tertinggi", topTeneraSupplier ? `${topTeneraSupplier.supplier} (${formatPct(topTeneraSupplier.pctTenera)})` : "-"]
    ]);

    byId("rankingDriver").innerHTML = miniList([
      ["Volume janjang tertinggi", topDriverVolume ? `${topDriverVolume.driver} (${formatNumber(topDriverVolume.totalJanjang)})` : "-"],
      ["Kualitas grading terbaik", bestDriver ? `${bestDriver.driver} (${formatPct(bestDriver.avgTotalCut)})` : "-"],
      ["Potongan tertinggi", worstDriver ? `${worstDriver.driver} (${formatPct(worstDriver.avgTotalCut)})` : "-"],
      ["Tenera tertinggi", topTeneraDriver ? `${topTeneraDriver.driver} (${formatPct(topTeneraDriver.pctTenera)})` : "-"]
    ]);
  }

  function renderMasterData() {
    renderMasterModuleStats();
    renderDriverMaster();
    renderSupplierMaster();
    renderPlateMaster();
  }

  function getMasterFilteredData() {
    const filters = getDateFilterFromControls("master");
    return {
      filters,
      grading: filterByDate(state.grading, filters.start, filters.end),
      td: filterByDate(state.td, filters.start, filters.end)
    };
  }

  function renderMasterModuleStats() {
    const { grading, td } = getMasterFilteredData();
    const supplierG = aggregateGradingBy(grading, "supplier");
    const driverG = aggregateGradingBy(grading, "driver");
    const supplierTd = aggregateTdBy(td, "supplier");
    const driverTd = aggregateTdBy(td, "driver");
    renderSimpleTable(byId("masterGradingSupplierTable"), supplierGradingColumns(), supplierG.map(toSupplierGradingRow));
    renderSimpleTable(byId("masterGradingDriverTable"), driverGradingColumns(), driverG.map(toDriverGradingRow));
    renderObjectTable(byId("masterGradingPlateTable"), getPlateStats(grading, td).map((r) => ({ Plat: r.plate, "Sopir sering": r.driverMost || "-", "Supplier sering": r.supplierMost || "-", "Input grading": r.gradingCount, "Total janjang": r.totalJanjang, "Terakhir": r.lastInput ? formatDate(r.lastInput) : "-" })), "Belum ada data plat grading.");
    renderSimpleTable(byId("masterTdSupplierTable"), supplierTdColumns(), supplierTd.map(toSupplierTdRow));
    renderSimpleTable(byId("masterTdDriverTable"), driverTdColumns(), driverTd.map(toDriverTdRow));
    renderObjectTable(byId("masterTdPlateTable"), getPlateStats(grading, td).map((r) => ({ Plat: r.plate, "Sopir sering": r.driverMost || "-", "Supplier sering": r.supplierMost || "-", "Input TD": r.tdCount, "Total sampel": r.totalSample, "Terakhir": r.lastInput ? formatDate(r.lastInput) : "-" })), "Belum ada data plat tenera dura.");
  }

  function renderDriverMaster() {
    const table = byId("driverMasterTable");
    const { grading, td } = getMasterFilteredData();
    const stats = getDriverStats(grading, td);
    if (!stats.length) {
      table.innerHTML = emptyTable("Belum ada data sopir.");
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Nama Sopir</th><th>Plat Default</th><th>Supplier Default</th><th>Input Grading</th><th>Input TD</th><th>Avg Potongan</th><th>Avg Masak</th><th>Avg Tenera</th><th>Avg Dura</th><th>Terakhir Input</th><th>Aksi</th></tr></thead>
      <tbody>${stats.map((row) => `<tr>
        <td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.plate || "-")}</td><td>${escapeHtml(row.supplier || "-")}</td><td>${formatNumber(row.gradingCount)}</td><td>${formatNumber(row.tdCount)}</td><td>${formatPct(row.avgTotalCut)}</td><td>${formatPct(row.pctMasak)}</td><td>${formatPct(row.pctTenera)}</td><td>${formatPct(row.pctDura)}</td><td>${row.lastInput ? formatDate(row.lastInput) : "-"}</td>
        <td>${isStaff() ? `<div class="row-actions"><button class="btn btn-secondary" data-action="edit-driver" data-id="${row.id}">Edit</button><button class="btn btn-danger" data-action="delete-driver" data-id="${row.id}">Hapus</button></div>` : "Akses Staff"}</td>
      </tr>`).join("")}</tbody>`;
  }

  function renderSupplierMaster() {
    const table = byId("supplierMasterTable");
    const { grading, td } = getMasterFilteredData();
    const stats = getSupplierStats(grading, td);
    if (!stats.length) {
      table.innerHTML = emptyTable("Belum ada data supplier.");
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Supplier</th><th>Status</th><th>Input Grading</th><th>Input TD</th><th>Total Janjang</th><th>Avg Potongan</th><th>Avg Masak</th><th>Avg Tenera</th><th>Avg Dura</th><th>Aksi</th></tr></thead>
      <tbody>${stats.map((row) => `<tr>
        <td>${escapeHtml(row.name)}</td><td>${row.status === "inactive" ? statusBadge("Nonaktif") : statusBadge("Aktif")}</td><td>${formatNumber(row.gradingCount)}</td><td>${formatNumber(row.tdCount)}</td><td>${formatNumber(row.totalJanjang)}</td><td>${formatPct(row.avgTotalCut)}</td><td>${formatPct(row.pctMasak)}</td><td>${formatPct(row.pctTenera)}</td><td>${formatPct(row.pctDura)}</td>
        <td>${isStaff() ? `<div class="row-actions"><button class="btn btn-secondary" data-action="edit-supplier" data-id="${row.id}">Edit</button><button class="btn btn-outline" data-action="toggle-supplier" data-id="${row.id}">${row.status === "inactive" ? "Aktifkan" : "Nonaktifkan"}</button><button class="btn btn-danger" data-action="delete-supplier" data-id="${row.id}">Hapus</button></div>` : "Akses Staff"}</td>
      </tr>`).join("")}</tbody>`;
  }

  function renderPlateMaster() {
    const table = byId("plateMasterTable");
    const { grading, td } = getMasterFilteredData();
    const rows = getPlateStats(grading, td);
    if (!rows.length) {
      table.innerHTML = emptyTable("Belum ada data plat.");
      return;
    }
    table.innerHTML = `
      <thead><tr><th>Nomor Polisi</th><th>Sopir Paling Sering</th><th>Supplier Paling Sering</th><th>Input Grading</th><th>Input TD</th><th>Total Janjang</th><th>Total Sampel</th><th>Terakhir Digunakan</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.plate)}</td><td>${escapeHtml(row.driverMost || "-")}</td><td>${escapeHtml(row.supplierMost || "-")}</td><td>${formatNumber(row.gradingCount)}</td><td>${formatNumber(row.tdCount)}</td><td>${formatNumber(row.totalJanjang)}</td><td>${formatNumber(row.totalSample)}</td><td>${row.lastInput ? formatDate(row.lastInput) : "-"}</td></tr>`).join("")}</tbody>`;
  }

  function saveMasterDriver() {
    if (!requireStaffAction()) return;
    const name = byId("masterDriverName").value.trim();
    const plate = byId("masterDriverPlate").value.trim().toUpperCase();
    const supplier = byId("masterDriverSupplier").value;
    if (!name) {
      toast("Nama sopir wajib diisi.", true);
      return;
    }
    if (state.editingDriverId) {
      const driver = state.drivers.find((item) => item.id === state.editingDriverId);
      if (driver) {
        driver.name = name;
        driver.plate = plate;
        driver.supplier = supplier;
        driver.updatedAt = new Date().toISOString();
      }
      state.editingDriverId = null;
    } else {
      const existing = state.drivers.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.plate = plate || existing.plate;
        existing.supplier = supplier || existing.supplier;
        existing.updatedAt = new Date().toISOString();
      } else {
        state.drivers.push({ id: makeId("DRV"), name, plate, supplier, createdAt: new Date().toISOString(), updatedAt: "" });
      }
    }
    byId("masterDriverName").value = "";
    byId("masterDriverPlate").value = "";
    byId("masterDriverSupplier").value = "";
    saveAll();
    renderAll();
    toast("Data sopir berhasil disimpan.");
  }

  function loadDriverToForm(id) {
    if (!requireStaffAction()) return;
    const driver = state.drivers.find((item) => item.id === id);
    if (!driver) return;
    state.editingDriverId = id;
    byId("masterDriverName").value = driver.name || "";
    byId("masterDriverPlate").value = driver.plate || "";
    byId("masterDriverSupplier").value = driver.supplier || "";
    showSection("masterSection");
    toast("Data sopir dimuat ke form edit.");
  }

  function deleteDriver(id) {
    if (!requireStaffAction()) return;
    const driver = state.drivers.find((item) => item.id === id);
    if (!driver) return;
    openModal("Hapus Sopir", `<p>Hapus sopir <strong>${escapeHtml(driver.name)}</strong> dari master data?</p>`, `<button class="btn btn-outline" data-close-modal>Batal</button><button class="btn btn-danger" id="confirmDeleteDriverButton">Hapus</button>`);
    byId("confirmDeleteDriverButton").addEventListener("click", () => {
      state.drivers = state.drivers.filter((item) => item.id !== id);
      deleteFirestoreDoc("drivers", id);
      saveAll();
      closeModal();
      renderAll();
      toast("Sopir berhasil dihapus.");
    });
  }

  function saveMasterSupplier() {
    if (!requireStaffAction()) return;
    const name = byId("masterSupplierName").value.trim();
    const status = byId("masterSupplierStatus").value;
    if (!name) {
      toast("Nama supplier wajib diisi.", true);
      return;
    }

    if (state.editingSupplierId) {
      const supplier = state.suppliers.find((item) => item.id === state.editingSupplierId);
      if (supplier) {
        const oldName = supplier.name;
        const nameChanged = oldName.toLowerCase() !== name.toLowerCase();
        let applyToOldTransactions = false;
        if (nameChanged) {
          applyToOldTransactions = confirm("Apakah perubahan nama supplier juga diterapkan ke data transaksi lama?\n\nOK = Ya, ubah semua data lama.\nCancel = Tidak, hanya ubah master supplier.");
        }
        supplier.name = name;
        supplier.status = status;
        supplier.updatedAt = new Date().toISOString();
        if (applyToOldTransactions) updateSupplierNameInOldData(oldName, name);
      }
      state.editingSupplierId = null;
    } else {
      const existing = state.suppliers.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.status = status;
        existing.updatedAt = new Date().toISOString();
      } else {
        state.suppliers.push({ id: makeId("SUP"), name, status, createdAt: new Date().toISOString(), updatedAt: "" });
      }
    }

    clearSupplierForm(false);
    saveAll();
    renderAll();
    toast("Data supplier berhasil disimpan.");
  }

  function updateSupplierNameInOldData(oldName, newName) {
    state.grading.forEach((row) => {
      if (row.supplier === oldName) {
        row.supplier = newName;
        row.updatedAt = new Date().toISOString();
        row.updatedBy = row.updatedBy || "Sistem";
      }
    });
    state.td.forEach((row) => {
      if (row.supplier === oldName) {
        row.supplier = newName;
        row.updatedAt = new Date().toISOString();
        row.updatedBy = row.updatedBy || "Sistem";
      }
    });
    state.drivers.forEach((driver) => {
      if (driver.supplier === oldName) {
        driver.supplier = newName;
        driver.updatedAt = new Date().toISOString();
      }
    });
    addAuditLog("supplier", oldName, "edit-nama-massal", { name: oldName }, { name: newName });
  }

  function clearSupplierForm(showToast = true) {
    if (!requireStaffAction()) return;
    state.editingSupplierId = null;
    byId("masterSupplierName").value = "";
    byId("masterSupplierStatus").value = "active";
    if (showToast) toast("Form supplier siap untuk tambah data baru.");
  }

  function loadSupplierToForm(id) {
    if (!requireStaffAction()) return;
    const supplier = state.suppliers.find((item) => item.id === id);
    if (!supplier) return;
    state.editingSupplierId = id;
    byId("masterSupplierName").value = supplier.name || "";
    byId("masterSupplierStatus").value = supplier.status || "active";
    showSection("masterSection");
    toast("Data supplier dimuat ke form edit.");
  }

  function toggleSupplierStatus(id) {
    if (!requireStaffAction()) return;
    const supplier = state.suppliers.find((item) => item.id === id);
    if (!supplier) return;
    supplier.status = supplier.status === "inactive" ? "active" : "inactive";
    supplier.updatedAt = new Date().toISOString();
    saveAll();
    renderAll();
    toast(`Supplier ${supplier.status === "inactive" ? "dinonaktifkan" : "diaktifkan"}.`);
  }

  function deleteSupplier(id) {
    if (!requireStaffAction()) return;
    const supplier = state.suppliers.find((item) => item.id === id);
    if (!supplier) return;
    openModal("Hapus Supplier", `<p>Hapus supplier <strong>${escapeHtml(supplier.name)}</strong> dari master data?</p><p class="muted">Data transaksi lama tidak akan ikut terhapus.</p>`, `<button class="btn btn-outline" data-close-modal>Batal</button><button class="btn btn-danger" id="confirmDeleteSupplierButton">Hapus</button>`);
    byId("confirmDeleteSupplierButton").addEventListener("click", () => {
      state.suppliers = state.suppliers.filter((item) => item.id !== id);
      deleteFirestoreDoc("suppliers", id);
      saveAll();
      closeModal();
      renderAll();
      toast("Supplier berhasil dihapus.");
    });
  }

  function openGradingDetail(id) {
    const row = state.grading.find((item) => item.id === id);
    if (!row) return;
    openModal("Detail Grading TBS", detailGridHtml(gradingDetailRows(row)), `<button class="btn btn-outline" data-close-modal>Tutup</button><button class="btn btn-secondary" data-action="wa-grading" data-id="${row.id}">Buat WA</button><button class="btn btn-secondary" data-action="preview-jpg-grading" data-id="${row.id}">Preview JPG</button><button class="btn btn-primary" data-action="download-jpg-grading" data-id="${row.id}">Download JPG</button><button class="btn btn-primary" data-action="share-download-jpg-grading" data-id="${row.id}">Download & Share WA</button>${isStaff() ? `<button class="btn btn-primary" data-action="edit-grading" data-id="${row.id}">Edit</button>` : ""}`);
  }

  function openTdDetail(id) {
    const row = state.td.find((item) => item.id === id);
    if (!row) return;
    openModal("Detail Tenera Dura", detailGridHtml(tdDetailRows(row)), `<button class="btn btn-outline" data-close-modal>Tutup</button><button class="btn btn-secondary" data-action="wa-td" data-id="${row.id}">Buat WA</button><button class="btn btn-secondary" data-action="preview-jpg-td" data-id="${row.id}">Preview JPG</button><button class="btn btn-primary" data-action="download-jpg-td" data-id="${row.id}">Download JPG</button><button class="btn btn-primary" data-action="share-download-jpg-td" data-id="${row.id}">Download & Share WA</button>${isStaff() ? `<button class="btn btn-primary" data-action="edit-td" data-id="${row.id}">Edit</button>` : ""}`);
  }

  function openGradingEdit(id) {
    if (!requireStaffAction()) return;
    const row = state.grading.find((item) => item.id === id);
    if (!row) return;
    const supplierOptions = supplierOptionsHtml(row.supplier);
    const html = `
      <form id="editGradingForm" class="form-grid">
        <label>Tanggal<input type="date" name="date" value="${escapeHtml(row.date)}"></label>
        <label>Nomor SPK<input type="text" name="spk" value="${escapeHtml(row.spk || "")}"></label>
        <label>Nama Sopir<input type="text" name="driver" value="${escapeHtml(row.driver)}" list="driversList"></label>
        <label>Nomor Polisi<input type="text" name="plate" value="${escapeHtml(row.plate)}"></label>
        <label>Supplier<select name="supplier">${supplierOptions}</select></label>
        <label>Nomor Tiket / DO<input type="text" name="ticket" value="${escapeHtml(row.ticket || "")}"></label>
        <label>Petugas<input type="text" name="officer" list="officersList" value="${escapeHtml(row.officer || "")}"></label>
        <label>Total Janjang<input type="number" min="0" name="totalJanjang" value="${row.totalJanjang}"></label>
        ${Object.keys(CATEGORY_LABELS).map((cat) => `<label>${CATEGORY_LABELS[cat]}<input type="number" min="0" name="${cat}" value="${row[cat] || 0}"></label>`).join("")}
        <label class="full-field">Catatan<textarea name="note" rows="3">${escapeHtml(row.note || "")}</textarea></label>
      </form>`;
    openModal("Edit Grading TBS", html, `<button class="btn btn-outline" data-close-modal>Batal</button><button class="btn btn-primary" data-action="save-edit-grading" data-id="${row.id}">Simpan Perubahan</button>`);
  }

  function openTdEdit(id) {
    if (!requireStaffAction()) return;
    const row = state.td.find((item) => item.id === id);
    if (!row) return;
    const supplierOptions = supplierOptionsHtml(row.supplier);
    const html = `
      <form id="editTdForm" class="form-grid">
        <label>Tanggal<input type="date" name="date" value="${escapeHtml(row.date)}"></label>
        <label>Nomor SPK<input type="text" name="spk" value="${escapeHtml(row.spk || "")}"></label>
        <label>Nama Sopir<input type="text" name="driver" value="${escapeHtml(row.driver)}" list="driversList"></label>
        <label>Nomor Polisi<input type="text" name="plate" value="${escapeHtml(row.plate)}"></label>
        <label>Supplier<select name="supplier">${supplierOptions}</select></label>
        <label>Nomor Tiket / DO<input type="text" name="ticket" value="${escapeHtml(row.ticket || "")}"></label>
        <label>Petugas<input type="text" name="officer" list="officersList" value="${escapeHtml(row.officer || "")}"></label>
        <label>Tenera<input type="number" min="0" name="tenera" value="${row.tenera || 0}"></label>
        <label>Dura<input type="number" min="0" name="dura" value="${row.dura || 0}"></label>
        <label class="full-field">Catatan<textarea name="note" rows="3">${escapeHtml(row.note || "")}</textarea></label>
      </form>`;
    openModal("Edit Tenera Dura", html, `<button class="btn btn-outline" data-close-modal>Batal</button><button class="btn btn-primary" data-action="save-edit-td" data-id="${row.id}">Simpan Perubahan</button>`);
  }

  function saveEditedGrading(id) {
    if (!requireStaffAction()) return;
    const form = byId("editGradingForm");
    if (!form) return;
    const old = state.grading.find((item) => item.id === id);
    if (!old) return;
    const values = getGradingFormValues(form);
    const result = calculateGrading(values);
    const validation = validateGradingForm(form, result);
    if (!validation.ok) {
      toast(validation.message, true);
      return;
    }
    const updated = {
      ...old,
      date: getText(form, "date"),
      spk: getText(form, "spk"),
      driver: getText(form, "driver"),
      plate: getText(form, "plate").toUpperCase(),
      supplier: getText(form, "supplier"),
      ticket: getText(form, "ticket"),
      officer: getText(form, "officer"),
      note: getText(form, "note"),
      ...result,
      updatedBy: getText(form, "officer") || "Operator",
      updatedAt: new Date().toISOString()
    };
    const index = state.grading.findIndex((item) => item.id === id);
    state.grading[index] = updated;
    upsertDriver(updated.driver, updated.plate, updated.supplier);
    addAuditLog("grading", id, "edit", old, updated);
    saveAll();
    setFirestoreDoc("grading", updated);
    setFirestoreDoc("drivers", state.drivers.find((item) => item.name.toLowerCase() === updated.driver.toLowerCase()));
    closeModal();
    renderAll();
    toast("Data grading berhasil diperbarui.");
  }

  function saveEditedTd(id) {
    if (!requireStaffAction()) return;
    const form = byId("editTdForm");
    if (!form) return;
    const old = state.td.find((item) => item.id === id);
    if (!old) return;
    const result = calculateTeneraDura({ tenera: getNumber(form, "tenera"), dura: getNumber(form, "dura") });
    const validation = validateTdForm(form, result);
    if (!validation.ok) {
      toast(validation.message, true);
      return;
    }
    const updated = {
      ...old,
      date: getText(form, "date"),
      spk: getText(form, "spk"),
      driver: getText(form, "driver"),
      plate: getText(form, "plate").toUpperCase(),
      supplier: getText(form, "supplier"),
      ticket: getText(form, "ticket"),
      officer: getText(form, "officer"),
      note: getText(form, "note"),
      ...result,
      updatedBy: getText(form, "officer") || "Operator",
      updatedAt: new Date().toISOString()
    };
    const index = state.td.findIndex((item) => item.id === id);
    state.td[index] = updated;
    upsertDriver(updated.driver, updated.plate, updated.supplier);
    addAuditLog("td", id, "edit", old, updated);
    saveAll();
    setFirestoreDoc("td", updated);
    setFirestoreDoc("drivers", state.drivers.find((item) => item.name.toLowerCase() === updated.driver.toLowerCase()));
    closeModal();
    renderAll();
    toast("Data tenera dura berhasil diperbarui.");
  }

  function confirmDeleteRecord(type, id) {
    if (!requireStaffAction()) return;
    const list = type === "grading" ? state.grading : state.td;
    const record = list.find((item) => item.id === id);
    if (!record) return;
    const label = type === "grading" ? "Grading TBS" : "Tenera Dura";
    const action = type === "grading" ? "confirm-delete-grading" : "confirm-delete-td";
    openModal(`Hapus ${label}`, `<p>Hapus data <strong>${escapeHtml(record.id)}</strong>?</p><p class="muted">Data yang dihapus akan dicatat di audit log.</p>`, `<button class="btn btn-outline" data-close-modal>Batal</button><button class="btn btn-danger" data-action="${action}" data-id="${id}">Hapus</button>`);
  }

  function deleteRecord(type, id) {
    if (!requireStaffAction()) return;
    if (type === "grading") {
      const old = state.grading.find((item) => item.id === id);
      state.grading = state.grading.filter((item) => item.id !== id);
      addAuditLog("grading", id, "hapus", old, null);
      deleteFirestoreDoc("grading", id);
    } else {
      const old = state.td.find((item) => item.id === id);
      state.td = state.td.filter((item) => item.id !== id);
      addAuditLog("td", id, "hapus", old, null);
      deleteFirestoreDoc("td", id);
    }
    saveAll();
    closeModal();
    renderAll();
    toast("Data berhasil dihapus.");
  }

  function addAuditLog(type, id, action, beforeData, afterData) {
    state.auditLogs.push({
      id: makeId("LOG"),
      transactionId: id,
      type,
      action,
      at: new Date().toISOString(),
      user: getCurrentRole() || "operator",
      beforeData,
      afterData
    });
  }

  function generateReport() {
    const module = byId("reportModule").value;
    const type = byId("reportType").value;
    const filters = getReportFilters();
    const data = module === "grading" ? filterTransactions(state.grading, filters) : filterTransactions(state.td, filters);
    let text = "";

    if (module === "grading") {
      if (type === "transaction") text = data.map(formatGradingTransactionReport).join("\n\n--------------------------\n\n");
      if (type === "overall") text = formatOverallGradingReport(data, filters);
      if (type === "supplier") text = aggregateGradingBy(data, "supplier").map((row) => formatSupplierGradingReport(row, filters)).join("\n\n--------------------------\n\n");
      if (type === "driver") text = aggregateGradingBy(data, "driver").map((row) => formatDriverGradingReport(row, filters)).join("\n\n--------------------------\n\n");
    } else {
      if (type === "transaction") text = data.map(formatTdTransactionReport).join("\n\n--------------------------\n\n");
      if (type === "overall") text = formatOverallTdReport(data, filters);
      if (type === "supplier") text = aggregateTdBy(data, "supplier").map((row) => formatSupplierTdReport(row, filters)).join("\n\n--------------------------\n\n");
      if (type === "driver") text = aggregateTdBy(data, "driver").map((row) => formatDriverTdReport(row, filters)).join("\n\n--------------------------\n\n");
    }

    byId("reportOutput").value = text || "Tidak ada data sesuai filter.";
  }

  function reportSingleGrading(id) {
    const record = state.grading.find((item) => item.id === id);
    if (!record) return;
    byId("reportOutput").value = formatGradingTransactionReport(record);
    byId("reportModule").value = "grading";
    byId("reportType").value = "transaction";
    showSection("reportSection");
  }

  function reportSingleTd(id) {
    const record = state.td.find((item) => item.id === id);
    if (!record) return;
    byId("reportOutput").value = formatTdTransactionReport(record);
    byId("reportModule").value = "td";
    byId("reportType").value = "transaction";
    showSection("reportSection");
  }

  async function copyReport() {
    const text = byId("reportOutput").value;
    if (!text) {
      toast("Belum ada laporan untuk disalin.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Laporan berhasil dicopy.");
    } catch (error) {
      byId("reportOutput").select();
      document.execCommand("copy");
      toast("Laporan berhasil dicopy.");
    }
  }

  function downloadReportTxt() {
    const text = byId("reportOutput").value;
    if (!text) {
      toast("Belum ada laporan untuk didownload.", true);
      return;
    }
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `Laporan_WA_${todayString()}.txt`);
  }

  function openWhatsapp() {
    const text = byId("reportOutput").value;
    if (!text) {
      toast("Belum ada laporan untuk dibuka ke WhatsApp.", true);
      return;
    }
    window.open(buildWhatsappUrl(text), "_blank");
    toast("WhatsApp dibuka. Pilih kontak atau grup tujuan secara manual.");
  }

  function getReportFilters() {
    const dateFilters = getDateFilterFromControls("report");
    return {
      ...dateFilters,
      supplier: byId("reportSupplier").value || "",
      driver: byId("reportDriver").value || "",
      plate: byId("reportPlate").value || "",
      search: ""
    };
  }

  function formatGradingTransactionReport(row) {
    return `${COMPANY_NAME}\nLAPORAN GRADING TBS\n\nTanggal: ${formatDate(row.date)}\nSPK: ${row.spk || "-"}\nNama Sopir: ${row.driver}\nNomor Polisi: ${row.plate}\nSupplier: ${row.supplier}\n${row.ticket ? `Nomor Tiket/DO: ${row.ticket}\n` : ""}\nTotal Janjang: ${formatNumber(row.totalJanjang)}\nTotal Masak: ${formatNumber(row.totalMasak)} (${formatPct(row.pcts.masak)})\nTotal Tidak Masak: ${formatNumber(row.totalTidakMasak)} (${formatPct(row.pcts.tidakMasak)})\n\nRincian Grading:\n- Mentah: ${formatNumber(row.mentah)} janjang (${formatPct(row.pcts.mentah)}) | Potongan: ${formatPct(row.cuts.mentah)}\n- Mengkal: ${formatNumber(row.mengkal)} janjang (${formatPct(row.pcts.mengkal)}) | Potongan: ${formatPct(row.cuts.mengkal)}\n- Tandan Kosong: ${formatNumber(row.tankos)} janjang (${formatPct(row.pcts.tankos)}) | Potongan: ${formatPct(row.cuts.tankos)}\n- Overripe: ${formatNumber(row.overripe)} janjang (${formatPct(row.pcts.overripe)}) | Potongan: ${formatPct(row.cuts.overripe)}\n- Busuk: ${formatNumber(row.busuk)} janjang (${formatPct(row.pcts.busuk)}) | Potongan: ${formatPct(row.cuts.busuk)}\n- Tangkai Panjang: ${formatNumber(row.tangkaiPanjang)} janjang (${formatPct(row.pcts.tangkaiPanjang)}) | Potongan: ${formatPct(row.cuts.tangkaiPanjang)}\n- Partheno: ${formatNumber(row.partheno)} janjang (${formatPct(row.pcts.partheno)}) | Potongan: ${formatPct(row.cuts.partheno)}\n- Makan Tikus: ${formatNumber(row.makanTikus)} janjang (${formatPct(row.pcts.makanTikus)}) | Potongan: ${formatPct(row.cuts.makanTikus)}\n\nPotongan Dasar: ${formatPct(row.baseCut)}\nTotal Potongan Akhir: ${formatPct(row.totalCut)}\nStatus Kualitas: ${row.status}`;
  }

  function formatTdTransactionReport(row) {
    return `${COMPANY_NAME}\nLAPORAN TENERA DURA\n\nTanggal: ${formatDate(row.date)}\nSPK: ${row.spk || "-"}\nNama Sopir: ${row.driver}\nNomor Polisi: ${row.plate}\nSupplier: ${row.supplier}\n${row.ticket ? `Nomor Tiket/DO: ${row.ticket}\n` : ""}\nTotal Sampel: ${formatNumber(row.totalSample)}\n\nRincian Sampel:\n- Tenera: ${formatNumber(row.tenera)} sampel (${formatPct(row.pctTenera)})\n- Dura: ${formatNumber(row.dura)} sampel (${formatPct(row.pctDura)})\n\nStatus Komposisi: ${row.status}`;
  }

  function formatOverallGradingReport(data, filters) {
    const row = overallGrading(data);
    return `${COMPANY_NAME}\nREKAP OVERALL GRADING TBS\n\nPeriode: ${periodText(filters)}\nTotal Transaksi: ${formatNumber(row.count)}\nTotal Janjang: ${formatNumber(row.totalJanjang)}\nTotal Masak: ${formatNumber(row.totalMasak)} (${formatPct(row.pctMasak)})\nTotal Tidak Masak: ${formatNumber(row.totalTidakMasak)} (${formatPct(row.pctTidakMasak)})\n\nRincian Grading:\n- Mentah: ${formatNumber(row.mentah)} (${formatPct(row.pctMentah)})\n- Mengkal: ${formatNumber(row.mengkal)} (${formatPct(row.pctMengkal)})\n- Tandan Kosong: ${formatNumber(row.tankos)} (${formatPct(row.pctTankos)})\n- Overripe: ${formatNumber(row.overripe)} (${formatPct(row.pctOverripe)})\n- Busuk: ${formatNumber(row.busuk)} (${formatPct(row.pctBusuk)})\n- Tangkai Panjang: ${formatNumber(row.tangkaiPanjang)} (${formatPct(row.pctTangkaiPanjang)})\n- Partheno: ${formatNumber(row.partheno)} (${formatPct(row.pctPartheno)})\n- Makan Tikus: ${formatNumber(row.makanTikus)} (${formatPct(row.pctMakanTikus)})\n\nRata-rata Potongan: ${formatPct(row.avgTotalCut)}\nPotongan Tertinggi: ${formatPct(row.maxCut)}\nPotongan Terendah: ${formatPct(row.minCut)}\nStatus Keseluruhan: ${row.status}`;
  }

  function formatOverallTdReport(data, filters) {
    const row = overallTeneraDura(data);
    return `${COMPANY_NAME}\nREKAP OVERALL TENERA DURA\n\nPeriode: ${periodText(filters)}\nTotal Transaksi: ${formatNumber(row.count)}\nTotal Sampel: ${formatNumber(row.totalSample)}\nTotal Tenera: ${formatNumber(row.totalTenera)} (${formatPct(row.pctTenera)})\nTotal Dura: ${formatNumber(row.totalDura)} (${formatPct(row.pctDura)})\n\nTenera Tertinggi: ${formatPct(row.maxTenera)}\nTenera Terendah: ${formatPct(row.minTenera)}\nDura Tertinggi: ${formatPct(row.maxDura)}\nDura Terendah: ${formatPct(row.minDura)}\nStatus Komposisi: ${row.status}`;
  }

  function formatSupplierGradingReport(row, filters) {
    return `${COMPANY_NAME}\nRINCIAN GRADING PER SUPPLIER\n\nPeriode: ${periodText(filters)}\nSupplier: ${row.supplier}\nTotal Pengiriman: ${formatNumber(row.count)}\nTotal Janjang: ${formatNumber(row.totalJanjang)}\nTotal Masak: ${formatNumber(row.totalMasak)} (${formatPct(row.pctMasak)})\nTotal Tidak Masak: ${formatNumber(row.totalTidakMasak)} (${formatPct(row.pctTidakMasak)})\n\nRincian Grading:\n- Mentah: ${formatNumber(row.mentah)} (${formatPct(row.pctMentah)})\n- Mengkal: ${formatNumber(row.mengkal)} (${formatPct(row.pctMengkal)})\n- Tandan Kosong: ${formatNumber(row.tankos)} (${formatPct(row.pctTankos)})\n- Overripe: ${formatNumber(row.overripe)} (${formatPct(row.pctOverripe)})\n- Busuk: ${formatNumber(row.busuk)} (${formatPct(row.pctBusuk)})\n- Tangkai Panjang: ${formatNumber(row.tangkaiPanjang)} (${formatPct(row.pctTangkaiPanjang)})\n- Partheno: ${formatNumber(row.partheno)} (${formatPct(row.pctPartheno)})\n- Makan Tikus: ${formatNumber(row.makanTikus)} (${formatPct(row.pctMakanTikus)})\n\nRata-rata Potongan: ${formatPct(row.avgTotalCut)}\nPotongan Tertinggi: ${formatPct(row.maxCut)}\nPotongan Terendah: ${formatPct(row.minCut)}\nStatus Kualitas Supplier: ${row.status}`;
  }

  function formatDriverGradingReport(row, filters) {
    return `${COMPANY_NAME}\nRINCIAN GRADING PER SOPIR\n\nPeriode: ${periodText(filters)}\nSopir: ${row.driver}\nPlat Paling Sering: ${row.plateMost || "-"}\nSupplier Paling Sering: ${row.supplierMost || "-"}\nTotal Pengiriman: ${formatNumber(row.count)}\nTotal Janjang: ${formatNumber(row.totalJanjang)}\nTotal Masak: ${formatNumber(row.totalMasak)} (${formatPct(row.pctMasak)})\nTotal Tidak Masak: ${formatNumber(row.totalTidakMasak)} (${formatPct(row.pctTidakMasak)})\n\nRincian Grading:\n- Mentah: ${formatNumber(row.mentah)} (${formatPct(row.pctMentah)})\n- Mengkal: ${formatNumber(row.mengkal)} (${formatPct(row.pctMengkal)})\n- Tandan Kosong: ${formatNumber(row.tankos)} (${formatPct(row.pctTankos)})\n- Overripe: ${formatNumber(row.overripe)} (${formatPct(row.pctOverripe)})\n- Busuk: ${formatNumber(row.busuk)} (${formatPct(row.pctBusuk)})\n- Tangkai Panjang: ${formatNumber(row.tangkaiPanjang)} (${formatPct(row.pctTangkaiPanjang)})\n- Partheno: ${formatNumber(row.partheno)} (${formatPct(row.pctPartheno)})\n- Makan Tikus: ${formatNumber(row.makanTikus)} (${formatPct(row.pctMakanTikus)})\n\nRata-rata Potongan: ${formatPct(row.avgTotalCut)}\nPotongan Tertinggi: ${formatPct(row.maxCut)}\nPotongan Terendah: ${formatPct(row.minCut)}\nStatus Kualitas Sopir: ${row.status}`;
  }

  function formatSupplierTdReport(row, filters) {
    return `${COMPANY_NAME}\nRINCIAN TENERA DURA PER SUPPLIER\n\nPeriode: ${periodText(filters)}\nSupplier: ${row.supplier}\nTotal Input: ${formatNumber(row.count)}\nTotal Sampel: ${formatNumber(row.totalSample)}\nTotal Tenera: ${formatNumber(row.totalTenera)} (${formatPct(row.pctTenera)})\nTotal Dura: ${formatNumber(row.totalDura)} (${formatPct(row.pctDura)})\n\nTenera Tertinggi: ${formatPct(row.maxTenera)}\nTenera Terendah: ${formatPct(row.minTenera)}\nDura Tertinggi: ${formatPct(row.maxDura)}\nDura Terendah: ${formatPct(row.minDura)}\nStatus Komposisi Supplier: ${row.status}`;
  }

  function formatDriverTdReport(row, filters) {
    return `${COMPANY_NAME}\nRINCIAN TENERA DURA PER SOPIR\n\nPeriode: ${periodText(filters)}\nSopir: ${row.driver}\nPlat Paling Sering: ${row.plateMost || "-"}\nSupplier Paling Sering: ${row.supplierMost || "-"}\nTotal Input: ${formatNumber(row.count)}\nTotal Sampel: ${formatNumber(row.totalSample)}\nTotal Tenera: ${formatNumber(row.totalTenera)} (${formatPct(row.pctTenera)})\nTotal Dura: ${formatNumber(row.totalDura)} (${formatPct(row.pctDura)})\n\nTenera Tertinggi: ${formatPct(row.maxTenera)}\nTenera Terendah: ${formatPct(row.minTenera)}\nDura Tertinggi: ${formatPct(row.maxDura)}\nDura Terendah: ${formatPct(row.minDura)}\nStatus Komposisi Sopir: ${row.status}`;
  }

  function overallGrading(data) {
    return aggregateGradingFromRecords(data, "overall", "Overall");
  }

  function aggregateGradingBy(data, key) {
    const map = new Map();
    data.forEach((row) => {
      const groupKey = row[key] || "-";
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(row);
    });
    return Array.from(map.entries()).map(([groupKey, rows]) => aggregateGradingFromRecords(rows, key, groupKey)).sort((a, b) => b.totalJanjang - a.totalJanjang);
  }

  function aggregateGradingFromRecords(rows, key, groupKey) {
    const totalJanjang = sum(rows, "totalJanjang");
    const totalMasak = sum(rows, "totalMasak");
    const totalTidakMasak = sum(rows, "totalTidakMasak");
    const mentah = sum(rows, "mentah");
    const mengkal = sum(rows, "mengkal");
    const tankos = sum(rows, "tankos");
    const overripe = sum(rows, "overripe");
    const busuk = sum(rows, "busuk");
    const tangkaiPanjang = sum(rows, "tangkaiPanjang");
    const partheno = sum(rows, "partheno");
    const makanTikus = sum(rows, "makanTikus");
    const avgTotalCut = weightedAverage(rows, "totalCut", "totalJanjang");
    const avgBaseCut = weightedAverage(rows, "baseCut", "totalJanjang");
    const avgCutMentah = weightedAverage(rows, "cuts.mentah", "totalJanjang");
    const avgCutMengkal = weightedAverage(rows, "cuts.mengkal", "totalJanjang");
    const avgCutTankos = weightedAverage(rows, "cuts.tankos", "totalJanjang");
    const avgCutOverripe = weightedAverage(rows, "cuts.overripe", "totalJanjang");
    const avgCutBusuk = weightedAverage(rows, "cuts.busuk", "totalJanjang");
    const avgCutTangkaiPanjang = weightedAverage(rows, "cuts.tangkaiPanjang", "totalJanjang");
    const avgCutPartheno = weightedAverage(rows, "cuts.partheno", "totalJanjang");
    const avgCutMakanTikus = weightedAverage(rows, "cuts.makanTikus", "totalJanjang");
    const cuts = rows.map((row) => Number(row.totalCut || 0));

    return {
      [key]: groupKey,
      count: rows.length,
      totalJanjang,
      totalMasak,
      pctMasak: pct(totalMasak, totalJanjang),
      totalTidakMasak,
      pctTidakMasak: pct(totalTidakMasak, totalJanjang),
      mentah,
      pctMentah: pct(mentah, totalJanjang),
      mengkal,
      pctMengkal: pct(mengkal, totalJanjang),
      tankos,
      pctTankos: pct(tankos, totalJanjang),
      overripe,
      pctOverripe: pct(overripe, totalJanjang),
      busuk,
      pctBusuk: pct(busuk, totalJanjang),
      tangkaiPanjang,
      pctTangkaiPanjang: pct(tangkaiPanjang, totalJanjang),
      partheno,
      pctPartheno: pct(partheno, totalJanjang),
      makanTikus,
      pctMakanTikus: pct(makanTikus, totalJanjang),
      avgBaseCut,
      avgCutMentah,
      avgCutMengkal,
      avgCutTankos,
      avgCutOverripe,
      avgCutBusuk,
      avgCutTangkaiPanjang,
      avgCutPartheno,
      avgCutMakanTikus,
      avgTotalCut,
      maxCut: rows.length ? Math.max(...cuts) : 0,
      minCut: rows.length ? Math.min(...cuts) : 0,
      status: qualityStatus(avgTotalCut),
      plateMost: mode(rows.map((row) => row.plate)),
      supplierMost: mode(rows.map((row) => row.supplier)),
      driverMost: mode(rows.map((row) => row.driver))
    };
  }

  function overallTeneraDura(data) {
    return aggregateTdFromRecords(data, "overall", "Overall");
  }

  function aggregateTdBy(data, key) {
    const map = new Map();
    data.forEach((row) => {
      const groupKey = row[key] || "-";
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(row);
    });
    return Array.from(map.entries()).map(([groupKey, rows]) => aggregateTdFromRecords(rows, key, groupKey)).sort((a, b) => b.totalSample - a.totalSample);
  }

  function aggregateTdFromRecords(rows, key, groupKey) {
    const totalSample = sum(rows, "totalSample");
    const totalTenera = sum(rows, "tenera");
    const totalDura = sum(rows, "dura");
    const teneraPcts = rows.map((row) => Number(row.pctTenera || 0));
    const duraPcts = rows.map((row) => Number(row.pctDura || 0));
    const pctTenera = pct(totalTenera, totalSample);
    const pctDura = pct(totalDura, totalSample);
    return {
      [key]: groupKey,
      count: rows.length,
      totalSample,
      totalTenera,
      pctTenera,
      totalDura,
      pctDura,
      maxTenera: rows.length ? Math.max(...teneraPcts) : 0,
      minTenera: rows.length ? Math.min(...teneraPcts) : 0,
      maxDura: rows.length ? Math.max(...duraPcts) : 0,
      minDura: rows.length ? Math.min(...duraPcts) : 0,
      status: tdStatus(pctTenera, pctDura),
      plateMost: mode(rows.map((row) => row.plate)),
      supplierMost: mode(rows.map((row) => row.supplier)),
      driverMost: mode(rows.map((row) => row.driver))
    };
  }

  function getDriverStats(gradingData = state.grading, tdData = state.td) {
    const names = new Map();
    state.drivers.forEach((driver) => names.set(driver.name, { ...driver }));
    [...state.grading, ...state.td].forEach((row) => {
      if (!names.has(row.driver)) names.set(row.driver, { id: makeId("DRV"), name: row.driver, plate: row.plate, supplier: row.supplier });
    });
    return Array.from(names.values()).map((driver) => {
      const g = gradingData.filter((row) => row.driver === driver.name);
      const t = tdData.filter((row) => row.driver === driver.name);
      const ag = aggregateGradingFromRecords(g, "driver", driver.name);
      const at = aggregateTdFromRecords(t, "driver", driver.name);
      return {
        ...driver,
        gradingCount: g.length,
        tdCount: t.length,
        avgTotalCut: ag.avgTotalCut,
        pctMasak: ag.pctMasak,
        pctTenera: at.pctTenera,
        pctDura: at.pctDura,
        lastInput: latestDate([...g, ...t])
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getSupplierStats(gradingData = state.grading, tdData = state.td) {
    return state.suppliers.map((supplier) => {
      const g = gradingData.filter((row) => row.supplier === supplier.name);
      const t = tdData.filter((row) => row.supplier === supplier.name);
      const ag = aggregateGradingFromRecords(g, "supplier", supplier.name);
      const at = aggregateTdFromRecords(t, "supplier", supplier.name);
      return {
        ...supplier,
        gradingCount: g.length,
        tdCount: t.length,
        totalJanjang: ag.totalJanjang,
        avgTotalCut: ag.avgTotalCut,
        pctMasak: ag.pctMasak,
        pctTenera: at.pctTenera,
        pctDura: at.pctDura
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getPlateStats(gradingData = state.grading, tdData = state.td) {
    const map = new Map();
    function initPlate(plate) {
      if (!map.has(plate)) map.set(plate, { plate, g: [], t: [] });
      return map.get(plate);
    }
    gradingData.forEach((row) => initPlate(row.plate).g.push(row));
    tdData.forEach((row) => initPlate(row.plate).t.push(row));
    return Array.from(map.values()).map((group) => ({
      plate: group.plate,
      driverMost: mode([...group.g, ...group.t].map((row) => row.driver)),
      supplierMost: mode([...group.g, ...group.t].map((row) => row.supplier)),
      gradingCount: group.g.length,
      tdCount: group.t.length,
      totalJanjang: sum(group.g, "totalJanjang"),
      totalSample: sum(group.t, "totalSample"),
      lastInput: latestDate([...group.g, ...group.t])
    })).sort((a, b) => a.plate.localeCompare(b.plate));
  }

  function exportMasterExcel() {
    if (!checkXlsx()) return;
    const { grading, td, filters } = getMasterFilteredData();
    const wb = XLSX.utils.book_new();
    appendSheet(wb, "Master Grading Supplier", aggregateGradingBy(grading, "supplier").map(toExportSupplierGradingRow));
    appendSheet(wb, "Master Grading Sopir", aggregateGradingBy(grading, "driver").map(toExportDriverGradingRow));
    appendSheet(wb, "Master Grading Plat", getPlateStats(grading, td).map((r) => ({ Plat: r.plate, "Sopir sering": r.driverMost || "-", "Supplier sering": r.supplierMost || "-", "Input grading": r.gradingCount, "Total janjang": r.totalJanjang, "Terakhir": r.lastInput ? formatDate(r.lastInput) : "-" })));
    appendSheet(wb, "Master TD Supplier", aggregateTdBy(td, "supplier").map(toExportSupplierTdRow));
    appendSheet(wb, "Master TD Sopir", aggregateTdBy(td, "driver").map(toExportDriverTdRow));
    appendSheet(wb, "Master TD Plat", getPlateStats(grading, td).map((r) => ({ Plat: r.plate, "Sopir sering": r.driverMost || "-", "Supplier sering": r.supplierMost || "-", "Input TD": r.tdCount, "Total sampel": r.totalSample, "Terakhir": r.lastInput ? formatDate(r.lastInput) : "-" })));
    appendSheet(wb, "Master Supplier", getSupplierStats(grading, td).map((r) => ({ Supplier: r.name, Status: r.status, "Input Grading": r.gradingCount, "Input TD": r.tdCount, "Total Janjang": r.totalJanjang, "Avg Potongan": formatPct(r.avgTotalCut), "Avg Masak": formatPct(r.pctMasak), "Avg Tenera": formatPct(r.pctTenera), "Avg Dura": formatPct(r.pctDura) })));
    appendSheet(wb, "Master Sopir", getDriverStats(grading, td).map((r) => ({ Sopir: r.name, "Plat Default": r.plate || "-", "Supplier Default": r.supplier || "-", "Input Grading": r.gradingCount, "Input TD": r.tdCount, "Avg Potongan": formatPct(r.avgTotalCut), "Avg Masak": formatPct(r.pctMasak), "Avg Tenera": formatPct(r.pctTenera), "Avg Dura": formatPct(r.pctDura), "Terakhir Input": r.lastInput ? formatDate(r.lastInput) : "-" })));
    appendSheet(wb, "Master Petugas", getOfficerStats(grading, td));
    XLSX.writeFile(wb, `Master_Data_${filePeriodName(filters)}.xlsx`);
  }

  function getOfficerStats(gradingData = state.grading, tdData = state.td) {
    const map = new Map();
    function entry(name) {
      const key = String(name || "-").trim() || "-";
      if (!map.has(key)) map.set(key, { Petugas: key, "Input Grading": 0, "Input TD": 0, "Total Janjang": 0, "Total Sampel": 0, "Terakhir Input": "" });
      return map.get(key);
    }
    gradingData.forEach((row) => {
      const e = entry(row.officer || row.createdBy || "-");
      e["Input Grading"] += 1;
      e["Total Janjang"] += Number(row.totalJanjang || 0);
      e["Terakhir Input"] = latestDateString(e["Terakhir Input"], row.date);
    });
    tdData.forEach((row) => {
      const e = entry(row.officer || row.createdBy || "-");
      e["Input TD"] += 1;
      e["Total Sampel"] += Number(row.totalSample || 0);
      e["Terakhir Input"] = latestDateString(e["Terakhir Input"], row.date);
    });
    return Array.from(map.values()).map((row) => ({ ...row, "Terakhir Input": row["Terakhir Input"] ? formatDate(row["Terakhir Input"]) : "-" })).sort((a, b) => a.Petugas.localeCompare(b.Petugas));
  }

  function latestDateString(a, b) {
    if (!a) return b || "";
    if (!b) return a || "";
    return a > b ? a : b;
  }

  function exportGradingExcel(data) {
    if (!checkXlsx()) return;
    const wb = XLSX.utils.book_new();
    appendSheet(wb, "Overall Grading", overallRowsToSheet(overallGrading(data)));
    appendSheet(wb, "Per Supplier Grading", aggregateGradingBy(data, "supplier").map(toExportSupplierGradingRow));
    appendSheet(wb, "Per Sopir Grading", aggregateGradingBy(data, "driver").map(toExportDriverGradingRow));
    appendSheet(wb, "Semua Data Grading", data.map(toExportAllGradingRow));
    XLSX.writeFile(wb, `Grading_TBS_${filePeriodName(getDateFilterFromControls("data"))}.xlsx`);
  }

  function exportTdExcel(data) {
    if (!checkXlsx()) return;
    const wb = XLSX.utils.book_new();
    appendSheet(wb, "Overall Tenera Dura", overallTdRowsToSheet(overallTeneraDura(data)));
    appendSheet(wb, "Per Supplier TD", aggregateTdBy(data, "supplier").map(toExportSupplierTdRow));
    appendSheet(wb, "Per Sopir TD", aggregateTdBy(data, "driver").map(toExportDriverTdRow));
    appendSheet(wb, "Semua Data TD", data.map(toExportAllTdRow));
    XLSX.writeFile(wb, `Tenera_Dura_${filePeriodName(getDateFilterFromControls("data"))}.xlsx`);
  }

  function exportCombinedExcel(gradingData, tdData) {
    if (!checkXlsx()) return;
    const wb = XLSX.utils.book_new();
    appendSheet(wb, "Overall Grading", overallRowsToSheet(overallGrading(gradingData)));
    appendSheet(wb, "Per Supplier Grading", aggregateGradingBy(gradingData, "supplier").map(toExportSupplierGradingRow));
    appendSheet(wb, "Per Sopir Grading", aggregateGradingBy(gradingData, "driver").map(toExportDriverGradingRow));
    appendSheet(wb, "Semua Data Grading", gradingData.map(toExportAllGradingRow));
    appendSheet(wb, "Overall Tenera Dura", overallTdRowsToSheet(overallTeneraDura(tdData)));
    appendSheet(wb, "Per Supplier TD", aggregateTdBy(tdData, "supplier").map(toExportSupplierTdRow));
    appendSheet(wb, "Per Sopir TD", aggregateTdBy(tdData, "driver").map(toExportDriverTdRow));
    appendSheet(wb, "Semua Data TD", tdData.map(toExportAllTdRow));
    XLSX.writeFile(wb, `Rekap_Grading_TeneraDura_${filePeriodName(getDateFilterFromControls("data"))}.xlsx`);
  }

  function checkXlsx() {
    if (typeof XLSX === "undefined") {
      toast("Library export Excel belum termuat. Pastikan internet aktif atau simpan SheetJS secara lokal.", true);
      return false;
    }
    return true;
  }

  function appendSheet(wb, name, rows) {
    const safeRows = rows.length ? rows : [{ Keterangan: "Tidak ada data" }];
    const ws = XLSX.utils.aoa_to_sheet([[COMPANY_NAME], [name], [`Dibuat: ${new Date().toLocaleString("id-ID")}`], []]);
    XLSX.utils.sheet_add_json(ws, safeRows, { origin: "A5" });
    const keys = Object.keys(safeRows[0] || {});
    ws["!cols"] = keys.map((key) => ({ wch: Math.max(14, key.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(name));
  }

  function overallRowsToSheet(row) {
    return [
      { Keterangan: "Total transaksi grading", Nilai: row.count },
      { Keterangan: "Total janjang", Nilai: row.totalJanjang },
      { Keterangan: "Total masak", Nilai: row.totalMasak },
      { Keterangan: "Persentase masak keseluruhan", Nilai: formatPct(row.pctMasak) },
      { Keterangan: "Total tidak masak", Nilai: row.totalTidakMasak },
      { Keterangan: "Persentase tidak masak keseluruhan", Nilai: formatPct(row.pctTidakMasak) },
      { Keterangan: "Total mentah", Nilai: row.mentah, Persentase: formatPct(row.pctMentah) },
      { Keterangan: "Total mengkal", Nilai: row.mengkal, Persentase: formatPct(row.pctMengkal) },
      { Keterangan: "Total tandan kosong", Nilai: row.tankos, Persentase: formatPct(row.pctTankos) },
      { Keterangan: "Total overripe", Nilai: row.overripe, Persentase: formatPct(row.pctOverripe) },
      { Keterangan: "Total busuk", Nilai: row.busuk, Persentase: formatPct(row.pctBusuk) },
      { Keterangan: "Total tangkai panjang", Nilai: row.tangkaiPanjang, Persentase: formatPct(row.pctTangkaiPanjang) },
      { Keterangan: "Total partheno", Nilai: row.partheno, Persentase: formatPct(row.pctPartheno) },
      { Keterangan: "Total makan tikus", Nilai: row.makanTikus, Persentase: formatPct(row.pctMakanTikus) },
      { Keterangan: "Rata-rata potongan dasar", Nilai: formatPct(row.avgBaseCut) },
      { Keterangan: "Rata-rata potongan mentah", Nilai: formatPct(row.avgCutMentah) },
      { Keterangan: "Rata-rata potongan mengkal", Nilai: formatPct(row.avgCutMengkal) },
      { Keterangan: "Rata-rata potongan tandan kosong", Nilai: formatPct(row.avgCutTankos) },
      { Keterangan: "Rata-rata potongan overripe", Nilai: formatPct(row.avgCutOverripe) },
      { Keterangan: "Rata-rata potongan busuk", Nilai: formatPct(row.avgCutBusuk) },
      { Keterangan: "Rata-rata potongan tangkai panjang", Nilai: formatPct(row.avgCutTangkaiPanjang) },
      { Keterangan: "Rata-rata potongan partheno", Nilai: formatPct(row.avgCutPartheno) },
      { Keterangan: "Rata-rata potongan makan tikus", Nilai: formatPct(row.avgCutMakanTikus) },
      { Keterangan: "Rata-rata total potongan akhir", Nilai: formatPct(row.avgTotalCut) },
      { Keterangan: "Potongan tertinggi", Nilai: formatPct(row.maxCut) },
      { Keterangan: "Potongan terendah", Nilai: formatPct(row.minCut) },
      { Keterangan: "Status kualitas keseluruhan", Nilai: row.status }
    ];
  }

  function overallTdRowsToSheet(row) {
    return [
      { Keterangan: "Total transaksi tenera dura", Nilai: row.count },
      { Keterangan: "Total sampel", Nilai: row.totalSample },
      { Keterangan: "Total tenera", Nilai: row.totalTenera, Persentase: formatPct(row.pctTenera) },
      { Keterangan: "Total dura", Nilai: row.totalDura, Persentase: formatPct(row.pctDura) },
      { Keterangan: "Persentase tenera tertinggi", Nilai: formatPct(row.maxTenera) },
      { Keterangan: "Persentase tenera terendah", Nilai: formatPct(row.minTenera) },
      { Keterangan: "Persentase dura tertinggi", Nilai: formatPct(row.maxDura) },
      { Keterangan: "Persentase dura terendah", Nilai: formatPct(row.minDura) },
      { Keterangan: "Status komposisi keseluruhan", Nilai: row.status }
    ];
  }

  function toExportSupplierGradingRow(row) {
    return {
      Supplier: row.supplier,
      "Total transaksi": row.count,
      "Total janjang": row.totalJanjang,
      "Total masak": row.totalMasak,
      "Persentase masak": formatPct(row.pctMasak),
      "Total tidak masak": row.totalTidakMasak,
      "Persentase tidak masak": formatPct(row.pctTidakMasak),
      "Total mentah": row.mentah,
      "Persentase mentah": formatPct(row.pctMentah),
      "Total mengkal": row.mengkal,
      "Persentase mengkal": formatPct(row.pctMengkal),
      "Total tandan kosong": row.tankos,
      "Persentase tandan kosong": formatPct(row.pctTankos),
      "Total overripe": row.overripe,
      "Persentase overripe": formatPct(row.pctOverripe),
      "Total busuk": row.busuk,
      "Persentase busuk": formatPct(row.pctBusuk),
      "Total tangkai panjang": row.tangkaiPanjang,
      "Persentase tangkai panjang": formatPct(row.pctTangkaiPanjang),
      "Total partheno": row.partheno,
      "Persentase partheno": formatPct(row.pctPartheno),
      "Total makan tikus": row.makanTikus,
      "Persentase makan tikus": formatPct(row.pctMakanTikus),
      "Rata-rata potongan dasar": formatPct(row.avgBaseCut),
      "Rata-rata potongan mentah": formatPct(row.avgCutMentah),
      "Rata-rata potongan mengkal": formatPct(row.avgCutMengkal),
      "Rata-rata potongan tandan kosong": formatPct(row.avgCutTankos),
      "Rata-rata potongan overripe": formatPct(row.avgCutOverripe),
      "Rata-rata potongan busuk": formatPct(row.avgCutBusuk),
      "Rata-rata potongan tangkai panjang": formatPct(row.avgCutTangkaiPanjang),
      "Rata-rata potongan partheno": formatPct(row.avgCutPartheno),
      "Rata-rata potongan makan tikus": formatPct(row.avgCutMakanTikus),
      "Rata-rata potongan akhir": formatPct(row.avgTotalCut),
      "Potongan tertinggi": formatPct(row.maxCut),
      "Potongan terendah": formatPct(row.minCut),
      "Status kualitas supplier": row.status
    };
  }

  function toExportDriverGradingRow(row) {
    return {
      "Nama sopir": row.driver,
      "Plat paling sering": row.plateMost,
      "Supplier paling sering": row.supplierMost,
      "Total transaksi": row.count,
      "Total janjang": row.totalJanjang,
      "Total masak": row.totalMasak,
      "Persentase masak": formatPct(row.pctMasak),
      "Total tidak masak": row.totalTidakMasak,
      "Persentase tidak masak": formatPct(row.pctTidakMasak),
      "Total mentah": row.mentah,
      "Persentase mentah": formatPct(row.pctMentah),
      "Total mengkal": row.mengkal,
      "Persentase mengkal": formatPct(row.pctMengkal),
      "Total tandan kosong": row.tankos,
      "Persentase tandan kosong": formatPct(row.pctTankos),
      "Total overripe": row.overripe,
      "Persentase overripe": formatPct(row.pctOverripe),
      "Total busuk": row.busuk,
      "Persentase busuk": formatPct(row.pctBusuk),
      "Total tangkai panjang": row.tangkaiPanjang,
      "Persentase tangkai panjang": formatPct(row.pctTangkaiPanjang),
      "Total partheno": row.partheno,
      "Persentase partheno": formatPct(row.pctPartheno),
      "Total makan tikus": row.makanTikus,
      "Persentase makan tikus": formatPct(row.pctMakanTikus),
      "Rata-rata potongan dasar": formatPct(row.avgBaseCut),
      "Rata-rata potongan mentah": formatPct(row.avgCutMentah),
      "Rata-rata potongan mengkal": formatPct(row.avgCutMengkal),
      "Rata-rata potongan tandan kosong": formatPct(row.avgCutTankos),
      "Rata-rata potongan overripe": formatPct(row.avgCutOverripe),
      "Rata-rata potongan busuk": formatPct(row.avgCutBusuk),
      "Rata-rata potongan tangkai panjang": formatPct(row.avgCutTangkaiPanjang),
      "Rata-rata potongan partheno": formatPct(row.avgCutPartheno),
      "Rata-rata potongan makan tikus": formatPct(row.avgCutMakanTikus),
      "Rata-rata potongan akhir": formatPct(row.avgTotalCut),
      "Potongan tertinggi": formatPct(row.maxCut),
      "Potongan terendah": formatPct(row.minCut),
      "Status kualitas sopir": row.status
    };
  }

  function toExportAllGradingRow(row) {
    return {
      "ID transaksi": row.id,
      Tanggal: row.date,
      "Nomor SPK": row.spk || "",
      "Jam input": row.time,
      "Nama sopir": row.driver,
      "Nomor polisi": row.plate,
      Supplier: row.supplier,
      "Nomor tiket / DO": row.ticket || "",
      "Petugas grading": row.officer || "",
      "Total janjang": row.totalJanjang,
      "Total masak": row.totalMasak,
      "Persentase masak": formatPct(row.pcts.masak),
      "Total tidak masak": row.totalTidakMasak,
      "Persentase tidak masak": formatPct(row.pcts.tidakMasak),
      Mentah: row.mentah,
      "Persentase mentah": formatPct(row.pcts.mentah),
      "Potongan mentah": formatPct(row.cuts.mentah),
      Mengkal: row.mengkal,
      "Persentase mengkal": formatPct(row.pcts.mengkal),
      "Potongan mengkal": formatPct(row.cuts.mengkal),
      "Tandan kosong": row.tankos,
      "Persentase tandan kosong": formatPct(row.pcts.tankos),
      "Potongan tandan kosong": formatPct(row.cuts.tankos),
      Overripe: row.overripe,
      "Persentase overripe": formatPct(row.pcts.overripe),
      "Potongan overripe": formatPct(row.cuts.overripe),
      Busuk: row.busuk,
      "Persentase busuk": formatPct(row.pcts.busuk),
      "Potongan busuk": formatPct(row.cuts.busuk),
      "Tangkai panjang": row.tangkaiPanjang,
      "Persentase tangkai panjang": formatPct(row.pcts.tangkaiPanjang),
      "Potongan tangkai panjang": formatPct(row.cuts.tangkaiPanjang),
      Partheno: row.partheno,
      "Persentase partheno": formatPct(row.pcts.partheno),
      "Potongan partheno": formatPct(row.cuts.partheno),
      "Makan tikus": row.makanTikus,
      "Persentase makan tikus": formatPct(row.pcts.makanTikus),
      "Potongan makan tikus": formatPct(row.cuts.makanTikus),
      "Potongan dasar": formatPct(row.baseCut),
      "Total potongan akhir": formatPct(row.totalCut),
      "Status kualitas": row.status,
      Catatan: row.note || "",
      "Dibuat oleh": row.createdBy || "",
      "Waktu dibuat": row.createdAt || "",
      "Terakhir diedit oleh": row.updatedBy || "",
      "Waktu terakhir diedit": row.updatedAt || ""
    };
  }

  function toExportSupplierTdRow(row) {
    return {
      Supplier: row.supplier,
      "Total transaksi": row.count,
      "Total sampel": row.totalSample,
      "Total tenera": row.totalTenera,
      "Persentase tenera": formatPct(row.pctTenera),
      "Total dura": row.totalDura,
      "Persentase dura": formatPct(row.pctDura),
      "Persentase tenera tertinggi": formatPct(row.maxTenera),
      "Persentase tenera terendah": formatPct(row.minTenera),
      "Persentase dura tertinggi": formatPct(row.maxDura),
      "Persentase dura terendah": formatPct(row.minDura),
      "Status komposisi supplier": row.status
    };
  }

  function toExportDriverTdRow(row) {
    return {
      "Nama sopir": row.driver,
      "Plat paling sering": row.plateMost,
      "Supplier paling sering": row.supplierMost,
      "Total transaksi": row.count,
      "Total sampel": row.totalSample,
      "Total tenera": row.totalTenera,
      "Persentase tenera": formatPct(row.pctTenera),
      "Total dura": row.totalDura,
      "Persentase dura": formatPct(row.pctDura),
      "Persentase tenera tertinggi": formatPct(row.maxTenera),
      "Persentase tenera terendah": formatPct(row.minTenera),
      "Persentase dura tertinggi": formatPct(row.maxDura),
      "Persentase dura terendah": formatPct(row.minDura),
      "Status komposisi sopir": row.status
    };
  }

  function toExportAllTdRow(row) {
    return {
      "ID transaksi": row.id,
      Tanggal: row.date,
      "Nomor SPK": row.spk || "",
      "Jam input": row.time,
      "Nama sopir": row.driver,
      "Nomor polisi": row.plate,
      Supplier: row.supplier,
      "Nomor tiket / DO": row.ticket || "",
      "Petugas input": row.officer || "",
      Tenera: row.tenera,
      Dura: row.dura,
      "Total sampel": row.totalSample,
      "Persentase tenera": formatPct(row.pctTenera),
      "Persentase dura": formatPct(row.pctDura),
      "Status komposisi": row.status,
      Catatan: row.note || "",
      "Dibuat oleh": row.createdBy || "",
      "Waktu dibuat": row.createdAt || "",
      "Terakhir diedit oleh": row.updatedBy || "",
      "Waktu terakhir diedit": row.updatedAt || ""
    };
  }

  function renderSettingsToInputs() {
    byId("settingAppName").value = state.settings.appName || "";
    byId("settingCompanyName").value = (!state.settings.companyName || state.settings.companyName === "Tenera Dura") ? COMPANY_NAME : state.settings.companyName;
    const g = state.settings.grading;
    byId("setBaseCut").value = g.baseCut;
    if (byId("gradingSettingsApplyMode")) byId("gradingSettingsApplyMode").value = "new";
    byId("setMentahCut").value = g.mentahCut;
    byId("setMengkalCut").value = g.mengkalCut;
    byId("setTankosCut").value = g.tankosCut;
    byId("setOverripeTolerance").value = g.overripeTolerance;
    byId("setOverripeCut").value = g.overripeCut;
    byId("setBusukCut").value = g.busukCut;
    byId("setTangkaiCut").value = g.tangkaiCut;
    byId("setParthenoCut").value = g.parthenoCut;
    byId("setMakanTikusCut").value = g.makanTikusCut;
    byId("setGoodMax").value = g.goodMax;
    byId("setMediumMax").value = g.mediumMax;
    const t = state.settings.td;
    byId("setTeneraLabel").value = t.teneraLabel;
    byId("setDuraLabel").value = t.duraLabel;
    byId("setBalanceTolerance").value = t.balanceTolerance;
    byId("setGoodTeneraMin").value = t.goodTeneraMin;
    byId("setHighDuraMax").value = t.highDuraMax;
  }

  function saveGeneralSettings() {
    if (!requireStaffAction()) return;
    state.settings.appName = byId("settingAppName").value.trim() || DEFAULT_SETTINGS.appName;
    state.settings.companyName = byId("settingCompanyName").value.trim() || DEFAULT_SETTINGS.companyName;
    saveAll();
    updateBrand();
    toast("Pengaturan umum disimpan.");
  }

  function saveGradingSettings() {
    if (!requireStaffAction()) return;
    const previous = clone(state.settings.grading);
    const applyMode = byId("gradingSettingsApplyMode")?.value || "new";
    state.settings.grading = readGradingSettingsFromInputs();

    let changedRecords = 0;
    if (applyMode === "all") {
      state.grading = state.grading.map((row) => {
        changedRecords += 1;
        return recalculateGradingRecord(row);
      });
    } else if (applyMode === "filtered") {
      const filters = getDateFilterFromControls("analysis");
      state.grading = state.grading.map((row) => {
        if (isDateInRange(row.date, filters.start, filters.end)) {
          changedRecords += 1;
          return recalculateGradingRecord(row);
        }
        return row;
      });
    }

    addAuditLog("settings", "grading", "edit-rumus", previous, { ...state.settings.grading, applyMode, changedRecords });
    saveAll();
    calculateGradingPreview();
    renderAll();
    const suffix = changedRecords ? ` ${changedRecords} data grading lama dihitung ulang.` : " Data lama tidak diubah.";
    toast(`Rumus grading disimpan.${suffix}`);
  }

  function readGradingSettingsFromInputs() {
    return {
      baseCut: numInput("setBaseCut"),
      mentahCut: numInput("setMentahCut"),
      mengkalCut: numInput("setMengkalCut"),
      tankosCut: numInput("setTankosCut"),
      overripeTolerance: numInput("setOverripeTolerance"),
      overripeCut: numInput("setOverripeCut"),
      busukCut: numInput("setBusukCut"),
      tangkaiCut: numInput("setTangkaiCut"),
      parthenoCut: numInput("setParthenoCut"),
      makanTikusCut: numInput("setMakanTikusCut"),
      goodMax: numInput("setGoodMax"),
      mediumMax: numInput("setMediumMax")
    };
  }

  function recalculateGradingRecord(row) {
    const result = calculateGrading({
      totalJanjang: row.totalJanjang,
      mentah: row.mentah,
      mengkal: row.mengkal,
      tankos: row.tankos,
      overripe: row.overripe,
      busuk: row.busuk,
      tangkaiPanjang: row.tangkaiPanjang,
      partheno: row.partheno,
      makanTikus: row.makanTikus
    });
    return {
      ...row,
      ...result,
      updatedBy: row.updatedBy || "Sistem",
      updatedAt: new Date().toISOString()
    };
  }

  function resetGradingSettings() {
    if (!requireStaffAction()) return;
    state.settings.grading = clone(DEFAULT_SETTINGS.grading);
    saveAll();
    renderAll();
    calculateGradingPreview();
    toast("Rumus grading dikembalikan ke default.");
  }

  function saveTdSettings() {
    if (!requireStaffAction()) return;
    state.settings.td = {
      teneraLabel: byId("setTeneraLabel").value.trim() || "Tenera",
      duraLabel: byId("setDuraLabel").value.trim() || "Dura",
      balanceTolerance: numInput("setBalanceTolerance"),
      goodTeneraMin: numInput("setGoodTeneraMin"),
      highDuraMax: numInput("setHighDuraMax")
    };
    saveAll();
    calculateTdPreview();
    renderAll();
    toast("Pengaturan tenera dura disimpan.");
  }

  function resetTdSettings() {
    if (!requireStaffAction()) return;
    state.settings.td = clone(DEFAULT_SETTINGS.td);
    saveAll();
    renderAll();
    calculateTdPreview();
    toast("Pengaturan tenera dura dikembalikan ke default.");
  }

  function exportBackupJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      gradingTransactions: state.grading,
      teneraDuraTransactions: state.td,
      drivers: state.drivers,
      suppliers: state.suppliers,
      settings: state.settings,
      auditLogs: state.auditLogs
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `Backup_Grading_TeneraDura_${todayString()}.json`);
  }

  function importBackupJson(event) {
    if (!requireStaffAction()) { event.target.value = ""; return; }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        state.grading = payload.gradingTransactions || [];
        state.td = payload.teneraDuraTransactions || [];
        state.drivers = payload.drivers || [];
        state.suppliers = payload.suppliers || [];
        state.settings = mergeDeep(clone(DEFAULT_SETTINGS), payload.settings || {});
        state.auditLogs = payload.auditLogs || [];
        ensureDefaults();
        saveAll();
        renderAll();
        toast("Backup berhasil diimport.");
      } catch (error) {
        toast("File backup tidak valid.", true);
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function confirmClearAllData() {
    if (!requireStaffAction()) return;
    openModal("Hapus Semua Data", `<p>Semua data lokal dan data Firestore aplikasi ini akan dihapus.</p><p><strong>Tindakan ini tidak bisa dibatalkan.</strong></p>`, `<button class="btn btn-outline" data-close-modal>Batal</button><button class="btn btn-danger" id="confirmClearAllButton">Hapus Semua</button>`);
    byId("confirmClearAllButton").addEventListener("click", async () => {
      try {
        await clearFirestoreCollections();
      } catch (error) {
        console.error(error);
        toast("Sebagian data Firebase gagal dihapus. Cek koneksi/rules.", true);
      }
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem(FIREBASE_MIGRATION_KEY);
      closeModal();
      location.reload();
    });
  }

  function qualityStatus(totalCut) {
    const settings = state.settings.grading;
    if (totalCut <= settings.goodMax) return "Bagus";
    if (totalCut <= settings.mediumMax) return "Sedang";
    return "Buruk";
  }

  function tdStatus(pctTenera, pctDura) {
    const tolerance = state.settings.td.balanceTolerance;
    if (Math.abs(pctTenera - pctDura) <= tolerance) return "Seimbang";
    return pctTenera > pctDura ? "Tenera dominan" : "Dura dominan";
  }

  function pct(value, total) {
    return total > 0 ? (Number(value || 0) / Number(total)) * 100 : 0;
  }

  function weightedAverage(rows, valueKey, weightKey) {
    const totalWeight = rows.reduce((sumValue, row) => sumValue + Number(getValue(row, weightKey) || 0), 0);
    if (totalWeight <= 0) return rows.length ? rows.reduce((sumValue, row) => sumValue + Number(getValue(row, valueKey) || 0), 0) / rows.length : 0;
    return rows.reduce((sumValue, row) => sumValue + Number(getValue(row, valueKey) || 0) * Number(getValue(row, weightKey) || 0), 0) / totalWeight;
  }

  function getValue(row, path) {
    return String(path).split(".").reduce((value, key) => (value == null ? undefined : value[key]), row);
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  }

  function mode(values) {
    const counts = new Map();
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    let best = "";
    let bestCount = 0;
    counts.forEach((count, value) => {
      if (count > bestCount) {
        best = value;
        bestCount = count;
      }
    });
    return best;
  }

  function latestDate(rows) {
    return rows.map((row) => row.date).filter(Boolean).sort().pop() || "";
  }

  function minBy(rows, key) {
    const valid = rows.filter((row) => Number.isFinite(Number(row[key])) && row.count !== 0);
    return valid.length ? valid.reduce((best, row) => Number(row[key]) < Number(best[key]) ? row : best, valid[0]) : null;
  }

  function maxBy(rows, key) {
    const valid = rows.filter((row) => Number.isFinite(Number(row[key])) && row.count !== 0);
    return valid.length ? valid.reduce((best, row) => Number(row[key]) > Number(best[key]) ? row : best, valid[0]) : null;
  }

  function getPresetRange(preset) {
    const today = new Date();
    const toStr = dateToString;
    if (preset === "all") return { start: "", end: "" };
    if (preset === "today") return { start: toStr(today), end: toStr(today) };
    if (preset === "yesterday") {
      const d = addDays(today, -1);
      return { start: toStr(d), end: toStr(d) };
    }
    if (preset === "week") {
      const day = today.getDay() || 7;
      const start = addDays(today, 1 - day);
      return { start: toStr(start), end: toStr(today) };
    }
    if (preset === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toStr(start), end: toStr(today) };
    }
    return { start: "", end: "" };
  }

  function getDateFilterFromControls(prefix) {
    const preset = byId(`${prefix}Preset`)?.value || "all";
    if (preset === "custom") {
      return { preset, start: byId(`${prefix}Start`)?.value || "", end: byId(`${prefix}End`)?.value || "" };
    }
    const range = getPresetRange(preset);
    return { preset, ...range };
  }

  function filterByDate(data, start, end) {
    return data.filter((item) => isDateInRange(item.date, start, end));
  }

  function isDateInRange(date, start, end) {
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }

  function periodText(filters) {
    if (!filters.start && !filters.end) return "Semua data";
    if (filters.start === filters.end) return formatDate(filters.start);
    return `${formatDate(filters.start)} s/d ${formatDate(filters.end)}`;
  }

  function periodLabel(filters) {
    return periodText(filters);
  }

  function filePeriodName(filters) {
    if (!filters.start && !filters.end) return "Semua_Data";
    if (filters.start === filters.end) return filters.start;
    return `${filters.start || "awal"}_${filters.end || "akhir"}`;
  }

  function todayString() {
    return dateToString(new Date());
  }

  function currentTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function dateToString(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function formatDate(dateString) {
    if (!dateString) return "-";
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID").format(Number(value || 0));
  }

  function formatPct(value) {
    return `${Number(value || 0).toFixed(2)}%`;
  }

  function numInput(id) {
    const value = Number(byId(id).value || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  }

  function nextTransactionId(prefix, date) {
    const compactDate = (date || todayString()).replaceAll("-", "");
    const list = prefix === "GRD" ? state.grading : state.td;
    const number = list.filter((item) => item.id && item.id.startsWith(`${prefix}-${compactDate}`)).length + 1;
    return `${prefix}-${compactDate}-${String(number).padStart(4, "0")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusText(status) {
    return String(status || "-");
  }

  function statusBadge(status) {
    const text = status || "-";
    const lower = text.toLowerCase();
    let cls = "badge-blue";
    if (lower.includes("bagus") || lower.includes("aktif") || lower.includes("tenera")) cls = "badge-green";
    if (lower.includes("sedang") || lower.includes("seimbang")) cls = "badge-yellow";
    if (lower.includes("buruk") || lower.includes("dura") || lower.includes("nonaktif")) cls = "badge-red";
    return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
  }

  function resultListHtml(rows) {
    return rows.map(([label, value]) => `<div class="result-item"><span>${escapeHtml(label)}</span><strong>${typeof value === "string" && value.includes("<span") ? value : escapeHtml(value)}</strong></div>`).join("");
  }

  function miniList(rows) {
    return rows.map(([label, value]) => `<div class="mini-item"><span>${escapeHtml(label)}</span><strong>${typeof value === "string" && value.includes("<span") ? value : escapeHtml(value)}</strong></div>`).join("") || `<div class="empty-state">Belum ada data.</div>`;
  }

  function summaryCards(rows) {
    return rows.map(([label, value, note]) => `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note || "")}</small></div>`).join("");
  }

  function renderBarChart(container, rows) {
    const sorted = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
    if (!sorted.length) {
      container.innerHTML = `<div class="empty-state">Belum ada data untuk grafik.</div>`;
      return;
    }
    const max = Math.max(...sorted.map((row) => row.value));
    container.innerHTML = sorted.map((row) => `
      <div class="bar-row">
        <span>${escapeHtml(row.label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width: ${Math.max(3, row.value / max * 100)}%"></div></div>
        <strong>${escapeHtml(row.display)}</strong>
      </div>`).join("");
  }

  function emptyTable(message) {
    return `<tbody><tr><td><div class="empty-state">${escapeHtml(message)}</div></td></tr></tbody>`;
  }

  function renderSimpleTable(table, columns, rows) {
    if (!rows.length) {
      table.innerHTML = emptyTable("Belum ada data.");
      return;
    }
    table.innerHTML = `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${row[column.key] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  }

  function renderObjectTable(table, rows, emptyMessage) {
    if (!rows.length) {
      table.innerHTML = emptyTable(emptyMessage || "Belum ada data.");
      return;
    }
    const columns = Object.keys(rows[0]);
    table.innerHTML = `<thead><tr>${columns.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((key) => `<td>${escapeHtml(row[key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
  }

  function categorySummaryCell(total, percent) {
    return `<span class="category-cell"><strong>${formatNumber(total)}</strong><small>${formatPct(percent)}</small></span>`;
  }

  function categorySummaryText(total, percent) {
    return `${formatNumber(total)} (${formatPct(percent)})`;
  }

  function categoryCutCell(total, percent, cut) {
    return `<span class="category-cell"><strong>${formatNumber(total)}</strong><small>${formatPct(percent)} | Pot ${formatPct(cut)}</small></span>`;
  }

  function supplierGradingColumns() {
    return [
      { key: "supplier", label: "Supplier" },
      { key: "count", label: "Transaksi" },
      { key: "totalJanjang", label: "Janjang" },
      { key: "masak", label: "Masak" },
      { key: "tidakMasak", label: "Tidak Masak" },
      { key: "mentah", label: "Mentah" },
      { key: "mengkal", label: "Mengkal" },
      { key: "tankos", label: "Tankos" },
      { key: "overripe", label: "Overripe" },
      { key: "busuk", label: "Busuk" },
      { key: "tangkaiPanjang", label: "Tangkai Panjang" },
      { key: "partheno", label: "Partheno" },
      { key: "makanTikus", label: "Makan Tikus" },
      { key: "avgBaseCut", label: "Avg Dasar" },
      { key: "avgCutMentah", label: "Pot. Mentah" },
      { key: "avgCutMengkal", label: "Pot. Mengkal" },
      { key: "avgCutTankos", label: "Pot. Tankos" },
      { key: "avgCutOverripe", label: "Pot. Overripe" },
      { key: "avgCutBusuk", label: "Pot. Busuk" },
      { key: "avgCutTangkaiPanjang", label: "Pot. Tangkai" },
      { key: "avgCutPartheno", label: "Pot. Partheno" },
      { key: "avgCutMakanTikus", label: "Pot. Tikus" },
      { key: "avgTotalCut", label: "Avg Potongan" },
      { key: "maxCut", label: "Pot. Tertinggi" },
      { key: "minCut", label: "Pot. Terendah" },
      { key: "status", label: "Status" }
    ];
  }

  function supplierTdColumns() {
    return [
      { key: "supplier", label: "Supplier" },
      { key: "count", label: "Transaksi" },
      { key: "totalSample", label: "Total Sampel" },
      { key: "tenera", label: "Tenera" },
      { key: "dura", label: "Dura" },
      { key: "maxTenera", label: "Tenera Tertinggi" },
      { key: "minTenera", label: "Tenera Terendah" },
      { key: "maxDura", label: "Dura Tertinggi" },
      { key: "minDura", label: "Dura Terendah" },
      { key: "status", label: "Status" }
    ];
  }

  function driverGradingColumns() {
    return [
      { key: "driver", label: "Sopir" },
      { key: "plateMost", label: "Plat Sering" },
      { key: "supplierMost", label: "Supplier Sering" },
      { key: "count", label: "Transaksi" },
      { key: "totalJanjang", label: "Janjang" },
      { key: "masak", label: "Masak" },
      { key: "tidakMasak", label: "Tidak Masak" },
      { key: "mentah", label: "Mentah" },
      { key: "mengkal", label: "Mengkal" },
      { key: "tankos", label: "Tankos" },
      { key: "overripe", label: "Overripe" },
      { key: "busuk", label: "Busuk" },
      { key: "tangkaiPanjang", label: "Tangkai Panjang" },
      { key: "partheno", label: "Partheno" },
      { key: "makanTikus", label: "Makan Tikus" },
      { key: "avgBaseCut", label: "Avg Dasar" },
      { key: "avgCutMentah", label: "Pot. Mentah" },
      { key: "avgCutMengkal", label: "Pot. Mengkal" },
      { key: "avgCutTankos", label: "Pot. Tankos" },
      { key: "avgCutOverripe", label: "Pot. Overripe" },
      { key: "avgCutBusuk", label: "Pot. Busuk" },
      { key: "avgCutTangkaiPanjang", label: "Pot. Tangkai" },
      { key: "avgCutPartheno", label: "Pot. Partheno" },
      { key: "avgCutMakanTikus", label: "Pot. Tikus" },
      { key: "avgTotalCut", label: "Avg Potongan" },
      { key: "maxCut", label: "Pot. Tertinggi" },
      { key: "minCut", label: "Pot. Terendah" },
      { key: "status", label: "Status" }
    ];
  }

  function driverTdColumns() {
    return [
      { key: "driver", label: "Sopir" },
      { key: "plateMost", label: "Plat Sering" },
      { key: "supplierMost", label: "Supplier Sering" },
      { key: "count", label: "Transaksi" },
      { key: "totalSample", label: "Total Sampel" },
      { key: "tenera", label: "Tenera" },
      { key: "dura", label: "Dura" },
      { key: "maxTenera", label: "Tenera Tertinggi" },
      { key: "minTenera", label: "Tenera Terendah" },
      { key: "maxDura", label: "Dura Tertinggi" },
      { key: "minDura", label: "Dura Terendah" },
      { key: "status", label: "Status" }
    ];
  }

  function allGradingColumns() {
    return [
      { key: "id", label: "ID" },
      { key: "date", label: "Tanggal" },
      { key: "time", label: "Jam" },
      { key: "spk", label: "SPK" },
      { key: "driver", label: "Sopir" },
      { key: "plate", label: "Plat" },
      { key: "supplier", label: "Supplier" },
      { key: "ticket", label: "Tiket/DO" },
      { key: "officer", label: "Petugas" },
      { key: "totalJanjang", label: "Janjang" },
      { key: "masak", label: "Masak" },
      { key: "tidakMasak", label: "Tidak Masak" },
      { key: "mentah", label: "Mentah" },
      { key: "mengkal", label: "Mengkal" },
      { key: "tankos", label: "Tankos" },
      { key: "overripe", label: "Overripe" },
      { key: "busuk", label: "Busuk" },
      { key: "tangkaiPanjang", label: "Tangkai Panjang" },
      { key: "partheno", label: "Partheno" },
      { key: "makanTikus", label: "Makan Tikus" },
      { key: "baseCut", label: "Pot. Dasar" },
      { key: "totalCut", label: "Total Potongan" },
      { key: "status", label: "Status" },
      { key: "note", label: "Catatan" },
      { key: "action", label: "Aksi" }
    ];
  }

  function allTdColumns() {
    return [
      { key: "id", label: "ID" },
      { key: "date", label: "Tanggal" },
      { key: "time", label: "Jam" },
      { key: "spk", label: "SPK" },
      { key: "driver", label: "Sopir" },
      { key: "plate", label: "Plat" },
      { key: "supplier", label: "Supplier" },
      { key: "ticket", label: "Tiket/DO" },
      { key: "officer", label: "Petugas" },
      { key: "totalSample", label: "Total Sampel" },
      { key: "tenera", label: "Tenera" },
      { key: "dura", label: "Dura" },
      { key: "status", label: "Status" },
      { key: "note", label: "Catatan" },
      { key: "action", label: "Aksi" }
    ];
  }

  function toSupplierGradingRow(row) {
    return {
      supplier: escapeHtml(row.supplier),
      count: formatNumber(row.count),
      totalJanjang: formatNumber(row.totalJanjang),
      masak: categorySummaryCell(row.totalMasak, row.pctMasak),
      tidakMasak: categorySummaryCell(row.totalTidakMasak, row.pctTidakMasak),
      mentah: categorySummaryCell(row.mentah, row.pctMentah),
      mengkal: categorySummaryCell(row.mengkal, row.pctMengkal),
      tankos: categorySummaryCell(row.tankos, row.pctTankos),
      overripe: categorySummaryCell(row.overripe, row.pctOverripe),
      busuk: categorySummaryCell(row.busuk, row.pctBusuk),
      tangkaiPanjang: categorySummaryCell(row.tangkaiPanjang, row.pctTangkaiPanjang),
      partheno: categorySummaryCell(row.partheno, row.pctPartheno),
      makanTikus: categorySummaryCell(row.makanTikus, row.pctMakanTikus),
      avgBaseCut: formatPct(row.avgBaseCut),
      avgCutMentah: formatPct(row.avgCutMentah),
      avgCutMengkal: formatPct(row.avgCutMengkal),
      avgCutTankos: formatPct(row.avgCutTankos),
      avgCutOverripe: formatPct(row.avgCutOverripe),
      avgCutBusuk: formatPct(row.avgCutBusuk),
      avgCutTangkaiPanjang: formatPct(row.avgCutTangkaiPanjang),
      avgCutPartheno: formatPct(row.avgCutPartheno),
      avgCutMakanTikus: formatPct(row.avgCutMakanTikus),
      avgTotalCut: formatPct(row.avgTotalCut),
      maxCut: formatPct(row.maxCut),
      minCut: formatPct(row.minCut),
      status: statusBadge(row.status)
    };
  }

  function toSupplierTdRow(row) {
    return {
      supplier: escapeHtml(row.supplier),
      count: formatNumber(row.count),
      totalSample: formatNumber(row.totalSample),
      tenera: categorySummaryCell(row.totalTenera, row.pctTenera),
      dura: categorySummaryCell(row.totalDura, row.pctDura),
      maxTenera: formatPct(row.maxTenera),
      minTenera: formatPct(row.minTenera),
      maxDura: formatPct(row.maxDura),
      minDura: formatPct(row.minDura),
      status: statusBadge(row.status)
    };
  }

  function toDriverGradingRow(row) {
    return {
      driver: escapeHtml(row.driver),
      plateMost: escapeHtml(row.plateMost || "-"),
      supplierMost: escapeHtml(row.supplierMost || "-"),
      count: formatNumber(row.count),
      totalJanjang: formatNumber(row.totalJanjang),
      masak: categorySummaryCell(row.totalMasak, row.pctMasak),
      tidakMasak: categorySummaryCell(row.totalTidakMasak, row.pctTidakMasak),
      mentah: categorySummaryCell(row.mentah, row.pctMentah),
      mengkal: categorySummaryCell(row.mengkal, row.pctMengkal),
      tankos: categorySummaryCell(row.tankos, row.pctTankos),
      overripe: categorySummaryCell(row.overripe, row.pctOverripe),
      busuk: categorySummaryCell(row.busuk, row.pctBusuk),
      tangkaiPanjang: categorySummaryCell(row.tangkaiPanjang, row.pctTangkaiPanjang),
      partheno: categorySummaryCell(row.partheno, row.pctPartheno),
      makanTikus: categorySummaryCell(row.makanTikus, row.pctMakanTikus),
      avgBaseCut: formatPct(row.avgBaseCut),
      avgCutMentah: formatPct(row.avgCutMentah),
      avgCutMengkal: formatPct(row.avgCutMengkal),
      avgCutTankos: formatPct(row.avgCutTankos),
      avgCutOverripe: formatPct(row.avgCutOverripe),
      avgCutBusuk: formatPct(row.avgCutBusuk),
      avgCutTangkaiPanjang: formatPct(row.avgCutTangkaiPanjang),
      avgCutPartheno: formatPct(row.avgCutPartheno),
      avgCutMakanTikus: formatPct(row.avgCutMakanTikus),
      avgTotalCut: formatPct(row.avgTotalCut),
      maxCut: formatPct(row.maxCut),
      minCut: formatPct(row.minCut),
      status: statusBadge(row.status)
    };
  }

  function toDriverTdRow(row) {
    return {
      driver: escapeHtml(row.driver),
      plateMost: escapeHtml(row.plateMost || "-"),
      supplierMost: escapeHtml(row.supplierMost || "-"),
      count: formatNumber(row.count),
      totalSample: formatNumber(row.totalSample),
      tenera: categorySummaryCell(row.totalTenera, row.pctTenera),
      dura: categorySummaryCell(row.totalDura, row.pctDura),
      maxTenera: formatPct(row.maxTenera),
      minTenera: formatPct(row.minTenera),
      maxDura: formatPct(row.maxDura),
      minDura: formatPct(row.minDura),
      status: statusBadge(row.status)
    };
  }

  function toAllGradingAnalysisRow(row) {
    return {
      id: escapeHtml(row.id),
      date: formatDate(row.date),
      time: escapeHtml(row.time || "-"),
      spk: escapeHtml(row.spk || "-"),
      driver: escapeHtml(row.driver),
      plate: escapeHtml(row.plate),
      supplier: escapeHtml(row.supplier),
      ticket: escapeHtml(row.ticket || "-"),
      officer: escapeHtml(row.officer || "-"),
      totalJanjang: formatNumber(row.totalJanjang),
      masak: categorySummaryCell(row.totalMasak, row.pcts.masak),
      tidakMasak: categorySummaryCell(row.totalTidakMasak, row.pcts.tidakMasak),
      mentah: categoryCutCell(row.mentah, row.pcts.mentah, row.cuts.mentah),
      mengkal: categoryCutCell(row.mengkal, row.pcts.mengkal, row.cuts.mengkal),
      tankos: categoryCutCell(row.tankos, row.pcts.tankos, row.cuts.tankos),
      overripe: categoryCutCell(row.overripe, row.pcts.overripe, row.cuts.overripe),
      busuk: categoryCutCell(row.busuk, row.pcts.busuk, row.cuts.busuk),
      tangkaiPanjang: categoryCutCell(row.tangkaiPanjang, row.pcts.tangkaiPanjang, row.cuts.tangkaiPanjang),
      partheno: categoryCutCell(row.partheno, row.pcts.partheno, row.cuts.partheno),
      makanTikus: categoryCutCell(row.makanTikus, row.pcts.makanTikus, row.cuts.makanTikus),
      baseCut: formatPct(row.baseCut),
      totalCut: formatPct(row.totalCut),
      status: statusBadge(row.status),
      note: escapeHtml(row.note || "-"),
      action: transactionActionsHtml("grading", row.id)
    };
  }

  function toAllTdAnalysisRow(row) {
    return {
      id: escapeHtml(row.id),
      date: formatDate(row.date),
      time: escapeHtml(row.time || "-"),
      spk: escapeHtml(row.spk || "-"),
      driver: escapeHtml(row.driver),
      plate: escapeHtml(row.plate),
      supplier: escapeHtml(row.supplier),
      ticket: escapeHtml(row.ticket || "-"),
      officer: escapeHtml(row.officer || "-"),
      totalSample: formatNumber(row.totalSample),
      tenera: categorySummaryCell(row.tenera, row.pctTenera),
      dura: categorySummaryCell(row.dura, row.pctDura),
      status: statusBadge(row.status),
      note: escapeHtml(row.note || "-"),
      action: transactionActionsHtml("td", row.id)
    };
  }

  function overallGradingRows(row) {
    return [
      ["Total transaksi", formatNumber(row.count)],
      ["Total janjang", formatNumber(row.totalJanjang)],
      ["Total masak", `${formatNumber(row.totalMasak)} (${formatPct(row.pctMasak)})`],
      ["Total tidak masak", `${formatNumber(row.totalTidakMasak)} (${formatPct(row.pctTidakMasak)})`],
      ["Mentah", `${formatNumber(row.mentah)} (${formatPct(row.pctMentah)})`],
      ["Mengkal", `${formatNumber(row.mengkal)} (${formatPct(row.pctMengkal)})`],
      ["Tandan kosong / Tankos", `${formatNumber(row.tankos)} (${formatPct(row.pctTankos)})`],
      ["Overripe", `${formatNumber(row.overripe)} (${formatPct(row.pctOverripe)})`],
      ["Busuk", `${formatNumber(row.busuk)} (${formatPct(row.pctBusuk)})`],
      ["Tangkai panjang", `${formatNumber(row.tangkaiPanjang)} (${formatPct(row.pctTangkaiPanjang)})`],
      ["Partheno", `${formatNumber(row.partheno)} (${formatPct(row.pctPartheno)})`],
      ["Makan tikus", `${formatNumber(row.makanTikus)} (${formatPct(row.pctMakanTikus)})`],
      ["Rata-rata potongan dasar", formatPct(row.avgBaseCut)],
      ["Rata-rata potongan mentah", formatPct(row.avgCutMentah)],
      ["Rata-rata potongan mengkal", formatPct(row.avgCutMengkal)],
      ["Rata-rata potongan tankos", formatPct(row.avgCutTankos)],
      ["Rata-rata potongan overripe", formatPct(row.avgCutOverripe)],
      ["Rata-rata potongan busuk", formatPct(row.avgCutBusuk)],
      ["Rata-rata potongan tangkai panjang", formatPct(row.avgCutTangkaiPanjang)],
      ["Rata-rata potongan partheno", formatPct(row.avgCutPartheno)],
      ["Rata-rata potongan makan tikus", formatPct(row.avgCutMakanTikus)],
      ["Rata-rata potongan akhir", formatPct(row.avgTotalCut)],
      ["Potongan tertinggi", formatPct(row.maxCut)],
      ["Potongan terendah", formatPct(row.minCut)],
      ["Status", statusBadge(row.status)]
    ];
  }

  function overallTdRows(row) {
    return [
      ["Total transaksi", formatNumber(row.count)],
      ["Total sampel", formatNumber(row.totalSample)],
      ["Total tenera", `${formatNumber(row.totalTenera)} (${formatPct(row.pctTenera)})`],
      ["Total dura", `${formatNumber(row.totalDura)} (${formatPct(row.pctDura)})`],
      ["Tenera tertinggi", formatPct(row.maxTenera)],
      ["Tenera terendah", formatPct(row.minTenera)],
      ["Dura tertinggi", formatPct(row.maxDura)],
      ["Dura terendah", formatPct(row.minDura)],
      ["Status", statusBadge(row.status)]
    ];
  }

  function gradingDetailRows(row) {
    return [
      ["ID", row.id], ["Tanggal", formatDate(row.date)], ["Jam", row.time], ["SPK", row.spk || "-"], ["Sopir", row.driver], ["Plat", row.plate], ["Supplier", row.supplier], ["Nomor Tiket/DO", row.ticket || "-"], ["Petugas", row.officer || "-"],
      ["Total Janjang", formatNumber(row.totalJanjang)], ["Total Masak", `${formatNumber(row.totalMasak)} (${formatPct(row.pcts.masak)})`], ["Total Tidak Masak", `${formatNumber(row.totalTidakMasak)} (${formatPct(row.pcts.tidakMasak)})`],
      ["Mentah", `${formatNumber(row.mentah)} (${formatPct(row.pcts.mentah)}) | Potongan ${formatPct(row.cuts.mentah)}`],
      ["Mengkal", `${formatNumber(row.mengkal)} (${formatPct(row.pcts.mengkal)}) | Potongan ${formatPct(row.cuts.mengkal)}`],
      ["Tankos", `${formatNumber(row.tankos)} (${formatPct(row.pcts.tankos)}) | Potongan ${formatPct(row.cuts.tankos)}`],
      ["Overripe", `${formatNumber(row.overripe)} (${formatPct(row.pcts.overripe)}) | Potongan ${formatPct(row.cuts.overripe)}`],
      ["Busuk", `${formatNumber(row.busuk)} (${formatPct(row.pcts.busuk)}) | Potongan ${formatPct(row.cuts.busuk)}`],
      ["Tangkai Panjang", `${formatNumber(row.tangkaiPanjang)} (${formatPct(row.pcts.tangkaiPanjang)}) | Potongan ${formatPct(row.cuts.tangkaiPanjang)}`],
      ["Partheno", `${formatNumber(row.partheno)} (${formatPct(row.pcts.partheno)}) | Potongan ${formatPct(row.cuts.partheno)}`],
      ["Makan Tikus", `${formatNumber(row.makanTikus)} (${formatPct(row.pcts.makanTikus)}) | Potongan ${formatPct(row.cuts.makanTikus)}`],
      ["Potongan Dasar", formatPct(row.baseCut)], ["Total Potongan", formatPct(row.totalCut)], ["Status", row.status], ["Catatan", row.note || "-"]
    ];
  }

  function tdDetailRows(row) {
    return [
      ["ID", row.id], ["Tanggal", formatDate(row.date)], ["Jam", row.time], ["SPK", row.spk || "-"], ["Sopir", row.driver], ["Plat", row.plate], ["Supplier", row.supplier], ["Nomor Tiket/DO", row.ticket || "-"], ["Petugas", row.officer || "-"],
      ["Total Sampel", formatNumber(row.totalSample)], ["Tenera", `${formatNumber(row.tenera)} (${formatPct(row.pctTenera)})`], ["Dura", `${formatNumber(row.dura)} (${formatPct(row.pctDura)})`], ["Status", row.status], ["Catatan", row.note || "-"]
    ];
  }

  function detailGridHtml(rows) {
    return `<div class="detail-grid">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${typeof value === "string" && value.includes("<span") ? value : escapeHtml(value)}</strong></div>`).join("")}</div>`;
  }

  function supplierOptionsHtml(selected) {
    return `<option value="">Pilih supplier</option>${state.suppliers.filter((supplier) => supplier.status !== "inactive" || supplier.name === selected).map((supplier) => `<option value="${escapeHtml(supplier.name)}" ${supplier.name === selected ? "selected" : ""}>${escapeHtml(supplier.name)}</option>`).join("")}`;
  }

  function openModal(title, bodyHtml, footerHtml) {
    byId("modalTitle").textContent = title;
    byId("modalBody").innerHTML = bodyHtml;
    byId("modalFooter").innerHTML = footerHtml || `<button class="btn btn-outline" data-close-modal>Tutup</button>`;
    byId("appModal").classList.add("open");
    byId("appModal").setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    byId("appModal").classList.remove("open");
    byId("appModal").setAttribute("aria-hidden", "true");
  }

  function toast(message, isError) {
    const toastEl = byId("toast");
    toastEl.textContent = message;
    toastEl.style.background = isError ? "#b42318" : "#0b3d2b";
    toastEl.classList.add("show");
    clearTimeout(toastEl.timer);
    toastEl.timer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeSheetName(name) {
    return name.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31);
  }
})();
