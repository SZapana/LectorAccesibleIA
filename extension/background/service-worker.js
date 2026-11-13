/**
 * Service Worker: síntesis simple via VoiceStudio (Jarvis voice, PCM 24kHz).
 * Basado en voice-moderator que FUNCIONA.
 */

const VOICESTUDIO_URL = 'http://127.0.0.1:3900';
const VOICE = 'df54e121'; // Don IA (muestra 7 s) - voz Donia
const TTS_MODEL = 'tts-1';

let offscreenPort = null;

// Una sola sintesis activa a la vez. El motor local procesa una por vez
// (40-240 s en CPU), asi que si el usuario sigue recorriendo bloques cada
// peticion queda encolada y oiria audios viejos minutos despues. Al llegar
// una peticion nueva se aborta la anterior y su audio no se reproduce.
let jobCounter = 0;
let currentJob = null;

function abortCurrentJob() {
  if (!currentJob) return;
  try { currentJob.controller.abort(); } catch {}
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

async function synthesize(text, signal) {
  diag('synthesize start len=' + text.length);
  const t0 = Date.now();
  const body = {
    model: 'tts-1',
    input: text,
    voice: 'df54e121', // Don IA (muestra 7 s) - voz Donia
    response_format: 'pcm',
    stream_format: 'audio',
  };
  const res = await fetch('http://127.0.0.1:3902/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  diag(`synthesize end ${buf.byteLength} bytes ${Date.now() - t0}ms`);
  return buf;
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

async function playAudio(pcmBuffer, jobId) {
  const port = await connectOffscreen();
  // Si mientras se sintetizaba el usuario se movio de bloque, este audio ya no
  // sirve: se descarta sin reproducir.
  if (jobId != null && currentJob?.id !== jobId) return false;
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
        case 'NAV_HABLAR': {
          const text = String(msg.texto ?? '').slice(0, 2000);
          if (!text) { sendResponse({ ok: false }); return; }
          const job = { id: ++jobCounter, controller: new AbortController() };
          abortCurrentJob();
          currentJob = job;
          stopCurrentAudio();
          diag(`NAV_HABLAR job=${job.id} len=${text.length}`);
          const pcm = await synthesize(text, job.controller.signal);
          if (currentJob?.id !== job.id) {
            diag(`job ${job.id} descartado: el usuario se movio de bloque`);
            sendResponse({ ok: false, superseded: true });
            return;
          }
          // Avisar que ya se esta reproduciendo (no al terminar la sintesis)
          const tabId = msg.tabId ?? sender.tab?.id;
          if (tabId) {
            try { await chrome.tabs.sendMessage(tabId, { type: 'NAV_STATUS', status: 'hablando' }); } catch {}
          }
          diag('playAudio start');
          await playAudio(pcm, job.id);
          diag('playAudio fin');
          if (currentJob?.id !== job.id) { sendResponse({ ok: false, superseded: true }); return; }
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: 'tipo desconocido' });
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        diag('sintesis cancelada: peticion mas reciente');
        sendResponse({ ok: false, superseded: true });
        return;
      }
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