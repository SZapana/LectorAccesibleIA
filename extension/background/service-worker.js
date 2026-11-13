/**
 * Service Worker: sintesis simple via VoiceStudio (voz Don IA, PCM 24kHz).
 * Basado en voice-moderator que FUNCIONA.
 */

const VOICESTUDIO_URL = 'http://127.0.0.1:3900';
const VOICE = 'df54e121'; // Don IA (muestra 7 s) - voz Donia
const TTS_MODEL = 'tts-1';

let offscreenPort = null;

// El motor local procesa UNA sintesis por vez (40-240 s en CPU) y NO cancela
// el trabajo si el cliente aborta la conexion: el job sigue ocupando el
// worker. Por eso no se encolan peticiones: hay una sola en curso y, como
// mucho, una pendiente que se sobreescribe con la mas reciente. Asi el
// motor nunca acumula jobs abandonados y el usuario solo oye el bloque
// donde se detuvo.
let sintetizando = false;
// El estado de navegacion es POR PESTANA: el numero de secuencia y el flag
// de cancelacion viven en el content script de cada pagina. Con un unico
// contador global, dos pestañas abiertas se invalidarian entre si.
const porTab = new Map();  // tabId -> { seq, cancelado, pendiente }

function estadoTab(tabId) {
  const id = tabId ?? -1;
  if (!porTab.has(id)) porTab.set(id, { seq: 0, cancelado: false, pendiente: null, reproduciendo: false });
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
    model: 'tts-1',
    input: text,
    voice: 'df54e121', // Don IA (muestra 7 s) - voz Donia
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
 * Bomba de sintesis: una sola en curso y, como mucho, una pendiente.
 * La pendiente se sobreescribe con el texto mas reciente, de modo que el
 * motor nunca recibe mas de un trabajo pendiente (el motor no cancela los
 * jobs si el cliente aborta, asi que acumularlos multiplica la espera).
 */
async function bombear() {
  if (sintetizando) return;
  sintetizando = true;
  try {
    for (;;) {
      // Se toma el primer trabajo pendiente (el orden del Map es el de
      // llegada). Los seq son por pestana, asi que no se comparan entre si.
      let job = null;
      for (const st of porTab.values()) { if (st.pendiente) { job = st.pendiente; break; } }
      if (!job) break;
      const st = estadoTab(job.tabId);
      st.pendiente = null;
      try {
        diag(`sintetizando seq=${job.seq} len=${job.text.length}`);
        const pcm = await synthesize(job.text);
        const st2 = estadoTab(job.tabId);
        // Si el usuario se movio de bloque mientras sintetizabamos, este audio
        // ya no es el que quiere: se descarta sin reproducir. La comprobacion
        // de `pendiente` es por pestana: que otra pestana pida voz no
        // invalida el audio de esta.
        const hayReemplazo = st2.pendiente && st2.pendiente.tabId === job.tabId;
        if (st2.cancelado || hayReemplazo || job.seq !== st2.seq) {
          diag('audio descartado: el usuario se movio de bloque');
          resolver(job, { ok: false, superseded: true });
          continue;
        }
        // Avisar que ya se esta reproduciendo (no al terminar la sintesis)
        const tabId = job.tabId;
        if (tabId) {
          try { await chrome.tabs.sendMessage(tabId, { type: 'NAV_STATUS', status: 'hablando' }); } catch {}
        }
        diag('playAudio start');
        st2.reproduciendo = true;
        await playAudio(pcm);
        st2.reproduciendo = false;
        diag('playAudio fin');
        resolver(job, { ok: true });
      } catch (e) {
        diag('ERROR ' + String(e));
        resolver(job, { ok: false, error: String(e) });
      }
    }
  } finally {
    sintetizando = false;
  }
}

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
          // El usuario salio del modo: se descarta lo pendiente y se invalida
          // la sintesis en curso, para que no suene nada al terminar.
          const st = estadoTab(msg.tabId ?? sender.tab?.id);
          st.cancelado = true;
          if (st.pendiente) { resolver(st.pendiente, { ok: false, superseded: true }); st.pendiente = null; }
          st.reproduciendo = false;
          stopCurrentAudio();
          diag('NAV_CANCELAR: audio en curso invalidado');
          sendResponse({ ok: true });
          return;
        }
        case 'NAV_HABLAR': {
          const text = String(msg.texto ?? '').slice(0, 2000);
          if (!text) { sendResponse({ ok: false }); return; }
          const seq = Number(msg.seq ?? 0);
          const tabId = msg.tabId ?? sender.tab?.id;
          const st = estadoTab(tabId);
          st.cancelado = false;
          // Si esa pestana ya tiene algo pendiente, se resuelve como superado:
          // solo queda la peticion mas reciente.
          if (st.pendiente) resolver(st.pendiente, { ok: false, superseded: true });
          st.pendiente = { text, seq, tabId, resolve: sendResponse };
          diag(`NAV_HABLAR seq=${seq} len=${text.length}`);
          bombear();
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

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'NAV_TOGGLE' });
});

chrome.commands?.onCommand?.addListener((cmd) => {
  if (cmd === 'toggle-nav') chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => t?.id && chrome.tabs.sendMessage(t.id, { type: 'NAV_TOGGLE' }));
});