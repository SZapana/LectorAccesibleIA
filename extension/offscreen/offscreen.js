/**
 * Offscreen: reproduce PCM 24kHz mono via Web Audio.
 *
 * El service worker es quien se conecta con `chrome.runtime.connect({name})`;
 * este documento debe registrar `chrome.runtime.onConnect` para recibir ese
 * port. Conectar desde aqui creaba un port huerfano que nadie escuchaba.
 */

let ctx = null;
let currentSource = null;

function initAudio() {
  try {
    ctx = new AudioContext({ sampleRate: 24000 });
  } catch (e) {
    try { ctx = new AudioContext(); } catch (e2) { ctx = null; }
  }
}

function pcmToFloat32(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

function base64ToFloat32(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  return float32;
}

async function handleMessage(port, msg) {
  try {
    switch (msg?.type) {
      case 'PLAY': {
        if (!ctx) { port.postMessage({ type: 'ERROR', id: msg.id, error: 'sin AudioContext' }); break; }
        if (ctx.state !== 'running') await ctx.resume();
        const pcm = msg.buffer ? pcmToFloat32(msg.buffer) : base64ToFloat32(msg.audio);
        if (currentSource) { try { currentSource.stop(); } catch {} }
        const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
        buffer.copyToChannel(pcm, 0);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        currentSource = src;
        src.onended = () => {
          if (src === currentSource) currentSource = null;
          port.postMessage({ type: 'FIN', id: msg.id });
        };
        src.start();
        break;
      }
      case 'STOP': {
        if (currentSource) { try { currentSource.stop(); } catch {} currentSource = null; }
        break;
      }
    }
  } catch (e) {
    port.postMessage({ type: 'ERROR', id: msg.id, error: String(e) });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tts-offscreen') return;
  port.onMessage.addListener((msg) => handleMessage(port, msg));
  port.postMessage({ type: 'READY' });
});

initAudio();
