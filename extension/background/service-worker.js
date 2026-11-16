/**
 * Service Worker: sintesis via VoiceStudio (voz Don IA, PCM 24kHz), cache de
 * audio por documento y prefetch de los bloques siguientes.
 *
 * El motor local procesa UNA sintesis por vez y NO cancela el trabajo si el
 * cliente aborta la conexion: el job sigue ocupando el worker. Por eso solo
 * hay una sintesis en curso y, como mucho, una pendiente por pestaña. Con la
 * GPU activa una sintesis cuesta 2-21 s en vez de 140-162 s.
 */

const VOICESTUDIO_URL = 'http://127.0.0.1:3900';
const VOICE = 'df54e121'; // Don IA (muestra 7 s) - voz Donia
const TTS_MODEL = 'tts-1';

// ── Cache de audio ───────────────────────────────────────────────────────
// La clave es `docId:hash(texto)`. El docId lo genera el content script en
// cada carga del documento, asi que al recargar la pagina la cache deja de
// ser valida sin escuchar eventos de navegacion ni pedir permisos extra.
// Todo es local: el audio no sale del equipo.
const CACHE_DB = 'lector-cache';
const CACHE_STORE = 'audio';
const CACHE_BUDGET = 128 * 1024 * 1024;    // tope de bytes guardados
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // purga de entradas viejas
// Un prefetch largo bloquearia la demanda (el motor no cancela jobs), asi que
// solo se pregeneran bloques cortos: titulos, botones y enlaces.
const PREFETCH_MAX_CHARS = 300;
const PREFETCH_MAX_COLA = 12;

let dbPromise = null;
let cacheBytes = 0;
let cacheIniciada = false;

function abrirCache() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const os = db.createObjectStore(CACHE_STORE, { keyPath: 'k' });
        os.createIndex('t', 't');
        os.createIndex('docId', 'docId');
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function hashTexto(texto) {
  const bytes = new TextEncoder().encode(texto);
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

// Purga por antiguedad y por presupuesto: recorre del mas viejo al mas nuevo
// y borra hasta que el total entra en el tope.
async function purgarCache(db) {
  const limite = Date.now() - CACHE_TTL_MS;
  const store = db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE);
  const idx = store.index('t');
  await new Promise((res) => {
    const cur = idx.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) { res(); return; }
      const e = c.value;
      if (e.t < limite || cacheBytes > CACHE_BUDGET) {
        cacheBytes -= e.size || 0;
        c.delete();
      }
      c.continue();
    };
    cur.onerror = () => res();
  });
}

async function cacheGet(docId, texto) {
  if (!docId) return null;
  try {
    const db = await abrirCache();
    const k = `${docId}:${await hashTexto(texto)}`;
    const e = await reqP(db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(k));
    return e?.audio || null;
  } catch { return null; }
}

async function cachePut(docId, texto, pcm) {
  if (!docId || !pcm?.byteLength || pcm.byteLength > CACHE_BUDGET) return;
  try {
    const db = await abrirCache();
    const k = `${docId}:${await hashTexto(texto)}`;
    const size = pcm.byteLength;
    await reqP(db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE).put({
      k, docId, size, t: Date.now(), audio: pcm,
    }));
    cacheBytes += size;
    await purgarCache(db);
  } catch (e) {
    diag('cache put fallo: ' + String(e));
  }
}

async function cacheIniciar() {
  if (cacheIniciada) return;
  cacheIniciada = true;
  try {
    const db = await abrirCache();
    // Se recalcula el total desde disco: el service worker puede haberse
    // reiniciado y el contador en memoria arranca en cero.
    const all = await reqP(db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).getAll());
    cacheBytes = all.reduce((s, e) => s + (e.size || 0), 0);
    await purgarCache(db);
    diag(`cache lista: ${all.length} entradas, ${(cacheBytes / 1048576).toFixed(1)} MB`);
  } catch (e) {
    diag('cache init fallo: ' + String(e));
  }
}

// ── Estado ───────────────────────────────────────────────────────────────
let offscreenPort = null;

let sintetizando = false;
// Estado de navegacion POR PESTANA: el numero de secuencia y el flag de
// cancelacion viven en el content script de cada pagina. Con un unico
// contador global, dos pestañas abiertas se invalidarian entre si.
const porTab = new Map();  // tabId -> { seq, cancelado, pendiente }
// Cola de prefetch (baja prioridad). Nunca se procesa si hay demanda.
let prefetchCola = [];     // [{ docId, texto }]

function estadoTab(tabId) {
  const id = tabId ?? -1;
  if (!porTab.has(id)) porTab.set(id, { seq: 0, cancelado: false, pendiente: null, reproduciendo: false, demandaEnCurso: false });
  return porTab.get(id);
}

function resolver(job, resp) {
  try { job.resolve(resp); } catch {}
}

function stopCurrentAudio() {
  try { if (offscreenPort) offscreenPort.postMessage({ type: 'STOP' }); } catch {}
}

let diagLines = [];
let diagReady = null;

function diag(msg) {
  const entry = new Date().toISOString().slice(11, 23) + ' ' + msg;
  // Las escrituras se encadenan: con get/set concurrentes (varias peticiones
  // en vuelo) cada escritura pisaba a la anterior y se perdian entradas.
  if (!diagReady) {
    diagReady = chrome.storage.local.get('diag')
      .then((d) => { diagLines = Array.isArray(d.diag) ? d.diag : []; })
      .catch(() => { diagLines = []; });
  }
  diagReady = diagReady.then(() => {
    diagLines.push(entry);
    if (diagLines.length > 60) diagLines = diagLines.slice(-60);
    return chrome.storage.local.set({ diag: diagLines.slice() });
  }).catch(() => {});
}

// ── Offscreen (reproduccion) ─────────────────────────────────────────────
async function ensureOffscreenDocument() {
  try {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (contexts.length > 0) return;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Reproducir el audio TTS generado localmente por VoiceStudio',
    });
  } catch (e) {
    const msg = String(e);
    if (!/single offscreen|already exists/i.test(msg)) throw e;
  }
}

function connectOffscreen() {
  if (offscreenPort) return Promise.resolve(offscreenPort);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout offscreen')), 10000);
    ensureOffscreenDocument()
      .then(() => new Promise((res, rej) => {
        // El service worker es el que conecta; el offscreen recibe el port
        // via chrome.runtime.onConnect y responde READY.
        const port = chrome.runtime.connect({ name: 'tts-offscreen' });
        const onReady = (msg) => {
          if (msg?.type !== 'READY') return;
          port.onMessage.removeListener(onReady);
          offscreenPort = port;
          port.onDisconnect.addListener(() => { offscreenPort = null; });
          res(port);
        };
        port.onMessage.addListener(onReady);
        setTimeout(() => {
          port.onMessage.removeListener(onReady);
          rej(new Error('offscreen no respondio READY'));
        }, 8000);
      }))
      .then((port) => { clearTimeout(timeout); resolve(port); })
      .catch((e) => { clearTimeout(timeout); reject(e); });
  });
}

async function synthesize(text) {
  diag('synthesize start len=' + text.length);
  const t0 = Date.now();
  const body = {
    model: TTS_MODEL,
    input: text,
    voice: VOICE,
    response_format: 'pcm',
    stream_format: 'audio',
  };
  // El motor puede rechazar con 429 cuando el pool esta saturado (control de
  // admision de VoiceStudio). Se reintenta en vez de fallar: la espera es
  // parte del funcionamiento, no un error.
  for (let intento = 1; ; intento++) {
    const res = await fetch('http://127.0.0.1:3902/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && intento <= 4) {
      const espera = Math.min(Number(res.headers.get('Retry-After') || 30) || 30, 90);
      diag(`sintesis rechazada (429), reintento ${intento} en ${espera}s`);
      await new Promise(r => setTimeout(r, espera * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    diag(`synthesize end ${buf.byteLength} bytes ${Date.now() - t0}ms`);
    return buf;
  }
}

/**
 * Convierte un buffer a base64 por trozos.
 * El messaging de extensiones serializa a JSON (no structured clone), asi que
 * un ArrayBuffer llegaria como {}. Y `String.fromCharCode(...bytes)` con
 * decenas de miles de argumentos revienta el stack (RangeError).
 */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function playAudio(pcmBuffer) {
  const port = await connectOffscreen();
  // Corta el audio anterior si todavia suena.
  try { port.postMessage({ type: 'STOP' }); } catch {}
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const handler = (msg) => {
      if (msg?.type === 'FIN' && msg.id === id) { port.onMessage.removeListener(handler); resolve(); }
      if (msg?.type === 'ERROR' && msg.id === id) { port.onMessage.removeListener(handler); reject(new Error(msg.error)); }
    };
    port.onMessage.addListener(handler);
    port.postMessage({ type: 'PLAY', audio: toBase64(pcmBuffer), id });
  });
}

/**
 * Bomba de sintesis con dos prioridades.
 * 1) Demanda: el bloque que el usuario esta mirando. Absoluta.
 * 2) Prefetch: los bloques siguientes, solo si no hay demanda pendiente.
 * El motor nunca acumula mas de un trabajo: es secuencial por diseño.
 */
async function bombear() {
  if (sintetizando) return;
  sintetizando = true;
  try {
    for (;;) {
      // Prioridad 1: demanda del usuario.
      let job = null;
      for (const st of porTab.values()) { if (st.pendiente) { job = st.pendiente; break; } }
      let esPrefetch = false;
      if (!job) {
        // Una demanda puede estar en vuelo (leyendo la cache) y todavia no
        // figura como pendiente. Arrancar un prefetch en ese hueco pondria al
        // usuario detras de un bloque que no pidio.
        let demandaEnVuelo = false;
        for (const st of porTab.values()) { if (st.demandaEnCurso) { demandaEnVuelo = true; break; } }
        if (demandaEnVuelo) break;
        // Prioridad 2: prefetch. Se salta lo que ya esta en cache.
        while (prefetchCola.length) {
          const p = prefetchCola.shift();
          if (!p.docId || !p.texto || p.texto.length > PREFETCH_MAX_CHARS) continue;
          const ya = await cacheGet(p.docId, p.texto);
          if (ya) continue;
          job = { texto: p.texto, docId: p.docId, tabId: null, seq: 0, prefetch: true, resolve: () => {} };
          esPrefetch = true;
          break;
        }
      }
      if (!job) break;

      if (!esPrefetch) {
        const st = estadoTab(job.tabId);
        st.pendiente = null;
      }

      try {
        // El motor no cancela jobs: si esta peticion ya no es la que quiere
        // el usuario, se descarta ANTES de tocar el motor para no quemar una
        // sintesis de 2-21 s en algo que nadie va a escuchar.
        if (!esPrefetch) {
          const stPre = estadoTab(job.tabId);
          if (stPre.cancelado || job.seq !== stPre.seq) {
            diag('peticion superada antes de sintetizar (no llega al motor)');
            resolver(job, { ok: false, superseded: true });
            continue;
          }
        }
        diag(`${esPrefetch ? 'prefetch' : 'sintetizando'} seq=${job.seq} len=${job.texto.length}`);
        const pcm = await synthesize(job.texto);
        // El audio se guarda SIEMPRE, incluso si luego se descarta: es justo
        // el que se reutiliza al volver a ese bloque.
        if (job.docId) cachePut(job.docId, job.texto, pcm).catch(() => {});
        if (esPrefetch) { resolver(job, { ok: true }); continue; }

        const st2 = estadoTab(job.tabId);
        // Si el usuario se movio de bloque mientras sintetizabamos, este audio
        // ya no es el que quiere: se descarta sin reproducir, pero queda en
        // cache. La comprobacion de `pendiente` es por pestana: que otra
        // pestana pida voz no invalida el audio de esta.
        const hayReemplazo = st2.pendiente && st2.pendiente.tabId === job.tabId;
        if (st2.cancelado || hayReemplazo || job.seq !== st2.seq) {
          diag('audio descartado (queda en cache): el usuario se movio de bloque');
          resolver(job, { ok: false, superseded: true });
          continue;
        }
        const tabId = job.tabId;
        if (tabId) {
          try { await chrome.tabs.sendMessage(tabId, { type: 'NAV_STATUS', status: 'hablando' }); } catch {}
        }
        diag('playAudio start');
        st2.reproduciendo = true;
        // La reproduccion no bloquea la bomba: mientras suena este bloque el
        // motor ya puede preparar los siguientes. Un playAudio nuevo corta el
        // anterior, y NAV_SEQ tambien lo corta cuando el usuario se mueve.
        playAudio(pcm)
          .catch((e) => diag('playAudio error ' + String(e)))
          .finally(() => { st2.reproduciendo = false; diag('playAudio fin'); });
        resolver(job, { ok: true });
      } catch (e) {
        diag('ERROR ' + String(e) + ' @ ' + String(e?.stack || '').split('\n').slice(0, 3).join(' | '));
        resolver(job, { ok: false, error: String(e) });
      }
    }
  } finally {
    sintetizando = false;
  }
}

// ── Mensajes ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'NAV_TOGGLE': {
          const tabId = msg.tabId ?? sender.tab?.id;
          if (!tabId) { sendResponse({ ok: false, error: 'sin tab' }); return; }
          await chrome.tabs.sendMessage(tabId, { type: 'NAV_TOGGLE' });
          sendResponse({ ok: true });
          return;
        }
        case 'NAV_SEQ': {
          // El content script avisa al instante en que el usuario se mueve:
          // el audio que este sintetizando ya no se reproduce.
          const st = estadoTab(msg.tabId ?? sender.tab?.id);
          const nuevo = Number(msg.seq ?? 0);
          // Si el audio del bloque anterior aun esta sonando, se corta: el
          // usuario ya se movio y no debe seguir oyendose el bloque viejo.
          if (nuevo !== st.seq && st.reproduciendo) {
            stopCurrentAudio();
            st.reproduciendo = false;
            diag(`audio cortado: el usuario paso al seq=${nuevo}`);
          }
          st.seq = nuevo;
          st.cancelado = false;
          sendResponse({ ok: true });
          return;
        }
        case 'NAV_CANCELAR': {
          // El usuario salio del modo: se descarta lo pendiente, se invalida
          // la sintesis en curso y se vacia el prefetch de esa pagina.
          const st = estadoTab(msg.tabId ?? sender.tab?.id);
          st.cancelado = true;
          if (st.pendiente) { resolver(st.pendiente, { ok: false, superseded: true }); st.pendiente = null; }
          st.reproduciendo = false;
          stopCurrentAudio();
          if (msg.docId) prefetchCola = prefetchCola.filter(p => p.docId !== msg.docId);
          diag('NAV_CANCELAR: audio en curso invalidado');
          sendResponse({ ok: true });
          return;
        }
        case 'NAV_PREFETCH': {
          // Se pregeneran los bloques siguientes en segundo plano. El filtro
          // de tamaño y la prioridad viven en bombear().
          const docId = String(msg.docId || '');
          const textos = Array.isArray(msg.textos) ? msg.textos : [];
          // La ventana REEMPLAZA la anterior del mismo documento: asi la
          // cola queda ordenada por cercanía al bloque actual y no acumula
          // bloques viejos que ya no interesa.
          prefetchCola = prefetchCola.filter(p => p.docId !== docId);
          for (const t of textos) {
            const texto = String(t || '');
            if (!texto || texto.length > PREFETCH_MAX_CHARS) continue;
            prefetchCola.push({ docId, texto });
          }
          if (prefetchCola.length > PREFETCH_MAX_COLA) prefetchCola = prefetchCola.slice(-PREFETCH_MAX_COLA);
          bombear();
          sendResponse({ ok: true, enCola: prefetchCola.length });
          return;
        }
        case 'NAV_HABLAR': {
          const text = String(msg.texto ?? '').slice(0, 2000);
          if (!text) { sendResponse({ ok: false }); return; }
          const seq = Number(msg.seq ?? 0);
          const tabId = msg.tabId ?? sender.tab?.id;
          const docId = String(msg.docId || '');
          const st = estadoTab(tabId);
          st.cancelado = false;
          // Marca sincrona: desde este instante hay una demanda en vuelo.
          // Se limpia en el finally, despues de encolarla o de resolverla.
          st.demandaEnCurso = true;
          try {
            // Cache hit: el bloque ya se sintetizo en esta misma carga de
            // pagina. Se reproduce sin tocar el motor (0 s de sintesis).
            if (docId) {
              const pcm = await cacheGet(docId, text);
              if (pcm) {
                // Otra peticion mas reciente puede haber llegado mientras se
                // leia la cache: en ese caso este audio ya no es el buscado.
                if (seq !== st.seq) { sendResponse({ ok: false, superseded: true }); return; }
                if (st.pendiente) { resolver(st.pendiente, { ok: false, superseded: true }); st.pendiente = null; }
                prefetchCola = prefetchCola.filter(p => p.texto !== text);
                st.seq = seq;
                diag(`cache hit seq=${seq} len=${text.length} ${pcm.byteLength} bytes`);
                if (tabId) {
                  try { await chrome.tabs.sendMessage(tabId, { type: 'NAV_STATUS', status: 'hablando' }); } catch {}
                }
                st.reproduciendo = true;
                // No se espera el final: la bomba sigue con el prefetch
                // mientras suena este audio.
                playAudio(pcm)
                  .catch((e) => diag('playAudio error ' + String(e)))
                  .finally(() => { st.reproduciendo = false; });
                sendResponse({ ok: true, hit: true });
                return;
              }
            }

            // Sin cache: cola coalescente. Si esa pestana ya tiene algo
            // pendiente, se resuelve como superado: solo queda la mas reciente.
            if (st.pendiente) resolver(st.pendiente, { ok: false, superseded: true });
            st.pendiente = { texto: text, seq, tabId, docId, prefetch: false, resolve: sendResponse };
            // Si el texto estaba en la cola de prefetch, se promueve a demanda.
            prefetchCola = prefetchCola.filter(p => p.texto !== text);
            diag(`NAV_HABLAR seq=${seq} len=${text.length}`);
          } finally {
            st.demandaEnCurso = false;
            bombear();
          }
          return;
        }
        default:
          sendResponse({ ok: false, error: 'tipo desconocido' });
      }
    } catch (e) {
      diag('ERROR ' + String(e));
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});

cacheIniciar();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'NAV_TOGGLE' });
});

chrome.commands?.onCommand?.addListener((cmd) => {
  if (cmd === 'toggle-nav') chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => t?.id && chrome.tabs.sendMessage(t.id, { type: 'NAV_TOGGLE' }));
});
