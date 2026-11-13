/**
 * Service Worker: síntesis simple via VoiceStudio (Jarvis voice, PCM 24kHz).
 * Basado en voice-moderator que FUNCIONA.
 */

const VOICESTUDIO_URL = 'http://127.0.0.1:3900';
const VOICE = 'df54e121'; // Don IA (muestra 7 s) - voz Donia
const TTS_MODEL = 'tts-1';

let offscreenPort = null;

function diag(msg) {
  const entry = new Date().toISOString().slice(11, 23) + ' ' + msg;
  chrome.storage.local.get('diag').then((d) => {
    const arr = Array.isArray(d.diag) ? d.diag : [];
    arr.push(entry);
    chrome.storage.local.set({ diag: arr.slice(-60) });
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
  const res = await fetch('http://127.0.0.1:3902/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

async function playAudio(pcmBuffer) {
  const port = await connectOffscreen();
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
          diag('NAV_HABLAR recibido');
          const pcm = await synthesize(text);
          // Avisar que ya se esta reproduciendo (no al terminar la sintesis)
          const tabId = msg.tabId ?? sender.tab?.id;
          if (tabId) {
            try { await chrome.tabs.sendMessage(tabId, { type: 'NAV_STATUS', status: 'hablando' }); } catch {}
          }
          diag('playAudio start');
          await playAudio(pcm);
          diag('playAudio fin');
          sendResponse({ ok: true });
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