/**
 * Navegación por Tab con voz clonada (Don IA, VoiceStudio local).
 * - Tab / Shift+Tab: siguiente/anterior bloque
 * - Enter: leer bloque con voz clonada
 * - Escape: salir
 * - Miniventana flotante con estado de lectura.
 */

console.log('[LECTOR NAV] Content script START');
try {
  (() => {
    console.log('[LECTOR NAV] IIFE START');
    if (window.__lectorNav) return;
    window.__lectorNav = true;
    console.log('[LECTOR NAV] Content script loaded, window.__lectorNav =', window.__lectorNav);

  // ── Selectores ──────────────────────────────────────────────────────────
  const SELECTOR = [
    'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,th,td,pre,caption',
    'a[href],button,summary,input:not([type="hidden"]),select,textarea',
    '[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]',
    'img[alt]'
  ].join(',');

  const PROSA = new Set(['H1','H2','H3','H4','H5','H6','P','LI','BLOCKQUOTE','FIGCAPTION','DT','DD','TH','TD','PRE','CAPTION']);
  const MAX_BLOQUES = 500;

  // ── Estado ──────────────────────────────────────────────────────────────
  let activo = false;
  let bloques = [];
  let indice = -1;
  let anillo = null;
  let observador = null;
  let hablarTexto = '';
  let hablarTimer = null;
  let miniventana = null;
  let hablando = false;
  let reqSeq = 0;

  // ── Miniventana flotante ───────────────────────────────────────────────
  function crearMiniventana() {
    if (miniventana) return;
    miniventana = document.createElement('div');
    miniventana.id = 'lector-miniventana';
    miniventana.setAttribute('aria-live', 'polite');
    miniventana.setAttribute('aria-label', 'Lector Accesible IA - estado de lectura');
    miniventana.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'width:320px',
      'max-width:90vw',
      'background:#0f172a',
      'border:1.5px solid #14b8a6',
      'border-radius:10px',
      'padding:12px 14px',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:13px',
      'color:#e2e8f0',
      'z-index:2147483647',
      'box-shadow:0 4px 24px rgba(0,0,0,.5)',
      'display:none',
      'user-select:none',
    ].join(';');

    miniventana.innerHTML = [
      '<div id="lector-mini-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">',
        '<span style="font-size:11px;font-weight:700;color:#14b8a6;letter-spacing:.05em;">DON IA</span>',
        '<span id="lector-mini-idx" style="font-size:11px;color:#64748b;"></span>',
      '</div>',
      '<div id="lector-mini-texto" style="font-size:13px;color:#f1f5f9;line-height:1.4;max-height:60px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin-bottom:8px;word-break:break-word;">',
        'Esperando...',
      '</div>',
      '<div id="lector-mini-estado" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">',
        '<span id="lector-mini-dot" style="width:8px;height:8px;border-radius:50%;background:#475569;flex-shrink:0;transition:background .3s;"></span>',
        '<span id="lector-mini-status" style="font-size:11px;color:#94a3b8;">Modo navegación</span>',
      '</div>',
      '<div style="display:flex;gap:6px;">',
        '<button id="lector-mini-ant" style="flex:1;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:5px 0;font-size:12px;cursor:pointer;">◀ Anterior</button>',
        '<button id="lector-mini-sig" style="flex:1;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:5px 0;font-size:12px;cursor:pointer;">Siguiente ▶</button>',
      '</div>',
    ].join('');

    document.documentElement.appendChild(miniventana);

    // Botones de navegación
    miniventana.querySelector('#lector-mini-ant').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activo || !bloques.length) return;
      mover(-1);
    });
    miniventana.querySelector('#lector-mini-sig').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activo || !bloques.length) return;
      mover(1);
    });
  }

  function mostrarMiniventana() {
    if (!miniventana) crearMiniventana();
    miniventana.style.display = 'block';
  }

  function ocultarMiniventana() {
    if (!miniventana) return;
    miniventana.style.display = 'none';
    hablarTexto = '';
    hablando = false;
    if (hablarTimer) { clearTimeout(hablarTimer); hablarTimer = null; }
  }

  function actualizarMiniventana() {
    if (!miniventana) return;
    const i = indice;
    const total = bloques.length;
    const bloque = bloques[i];
    miniventana.querySelector('#lector-mini-idx').textContent = total ? `${i + 1} / ${total}` : '';
    miniventana.querySelector('#lector-mini-texto').textContent = bloque ? bloque.txt.slice(0, 200) : 'Esperando...';
    miniventana.querySelector('#lector-mini-texto').style.color = '#f1f5f9';
  }

  function mostrarHablar(texto, procesando) {
    if (!miniventana) crearMiniventana();
    miniventana.style.display = 'block';
    hablarTexto = texto;
    miniventana.querySelector('#lector-mini-texto').textContent = texto;
    const dot = miniventana.querySelector('#lector-mini-dot');
    const status = miniventana.querySelector('#lector-mini-status');
    if (procesando) {
      dot.style.background = '#f59e0b';
      status.textContent = 'Procesando voz...';
      miniventana.querySelector('#lector-mini-texto').style.color = '#fde68a';
    } else {
      dot.style.background = '#14b8a6';
      status.textContent = '▶ Hablando';
      miniventana.querySelector('#lector-mini-texto').style.color = '#f1f5f9';
    }
    actualizarMiniventana();
  }

  function finHablar() {
    if (!miniventana) return;
    const dot = miniventana.querySelector('#lector-mini-dot');
    const status = miniventana.querySelector('#lector-mini-status');
    dot.style.background = '#22c55e';
    status.textContent = 'Listo';
    hablarTimer = setTimeout(() => {
      if (miniventana) {
        dot.style.background = '#475569';
        status.textContent = 'Modo navegación';
        hablarTexto = '';
        hablando = false;
      }
    }, 20000);
  }

  // ── Utilidades ──────────────────────────────────────────────────────────
  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

  function esEditable(el) {
    if (!el || el === document.body) return false;
    const t = el.tagName;
    if (t === 'TEXTAREA' || t === 'SELECT') return true;
    if (t === 'INPUT') {
      const tipo = (el.type || 'text').toLowerCase();
      return !['button','submit','reset','checkbox','radio','range','color','file','image'].includes(tipo);
    }
    return el.isContentEditable === true;
  }

  function rolDe(el) {
    const tag = el.tagName, role = (el.getAttribute('role')||'').toLowerCase(), tipo = (el.getAttribute('type')||'').toLowerCase();
    if (/^H[1-6]$/.test(tag)) return `Encabezado nivel ${tag[1]}`;
    if (tag === 'A') return 'Enlace';
    if (tag === 'BUTTON' || role === 'button') return 'Botón';
    if (tag === 'IMG') return 'Imagen';
    if (tag === 'LI') return 'Elemento lista';
    if (tag === 'BLOCKQUOTE') return 'Cita';
    if (tag === 'PRE') return 'Código';
    if (tag === 'TH') return 'Celda encabezado';
    if (tag === 'TD') return 'Celda';
    if (tag === 'CAPTION') return 'Título tabla';
    if (tag === 'SUMMARY') return 'Desplegable';
    if (tag === 'SELECT') return 'Lista';
    if (tag === 'TEXTAREA') return 'Área texto';
    if (role === 'checkbox' || role === 'switch') return `Casilla ${el.getAttribute('aria-checked')==='true'?'marcada':'no marcada'}`;
    if (tag === 'INPUT') {
      if (tipo === 'checkbox') return `Casilla ${el.checked?'marcada':'no marcada'}`;
      if (tipo === 'radio') return `Radio ${el.checked?'seleccionado':'no seleccionado'}`;
      if (['submit','button','reset'].includes(tipo)) return 'Botón';
      return 'Campo texto';
    }
    if (el.closest('a[href]')) return 'Enlace';
    return '';
  }

  function visible(el) {
    if (el.closest('script,style,noscript,template,svg,canvas,[hidden],[aria-hidden="true"],[contenteditable="true"]')) return false;
    try {
      if (el.checkVisibility) return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden';
    } catch { return false; }
    return el.getClientRects().length > 0;
  }

  // ── Recolección ─────────────────────────────────────────────────────────
  function recolectar() {
    if (!document.body) return [];
    const cand = [];
    for (const el of document.body.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,th,td,pre,caption,' +
      'a[href],button,summary,input:not([type="hidden"]),select,textarea,' +
      '[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],img[alt]'
    )) {
      if (cand.length >= MAX_BLOQUES * 2) break;
      if (!visible(el)) continue;
      const txt = (() => { const tag = el.tagName; if (tag === 'IMG') return norm(el.alt); if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return norm(el.value || el.placeholder || '').slice(0, 2000); return norm(el.innerText || el.textContent || '').slice(0, 2000); })();
      if (!txt || txt.length < 2) continue;
      cand.push({ el, txt, prosa: PROSA.has(el.tagName) });
    }
    const prosa = cand.filter(c => c.prosa);
    const tapados = new Set();
    for (const p of prosa) for (const h of prosa) {
      if (p === h) continue;
      if (h.txt.length >= p.txt.length * 0.6 && p.el !== h.el && p.el.contains(h.el)) { tapados.add(p); break; }
    }
    const out = [];
    for (const c of cand) if (!tapados.has(c)) { out.push({ el: c.el, txt: c.txt, rol: rolDe(c.el) }); if (out.length >= MAX_BLOQUES) break; }
    return out;
  }

  function recalcular() {
    const ant = bloques[indice]?.el;
    bloques = recolectar();
    if (!bloques.length) { indice = -1; return; }
    if (ant) {
      let i = bloques.findIndex(b => b.el === ant);
      if (i < 0) i = bloques.findIndex(b => b.el.contains(ant) || ant.contains(b.el));
      indice = i >= 0 ? i : Math.min(indice, bloques.length - 1);
    } else {
      indice = Math.min(indice, bloques.length - 1);
    }
  }

  // ── Anillo visual ───────────────────────────────────────────────────────
  function posAnillo() {
    if (!anillo || !activo) return;
    const b = bloques[indice];
    if (!b) { anillo.style.display = 'none'; return; }
    const r = b.el.getBoundingClientRect();
    if (!r.width && !r.height) { anillo.style.display = 'none'; return; }
    anillo.style.display = 'block';
    anillo.style.top = `${Math.max(2, r.top - 4)}px`;
    anillo.style.left = `${Math.max(2, r.left - 4)}px`;
    anillo.style.width = `${Math.max(8, r.width + 8)}px`;
    anillo.style.height = `${Math.max(8, r.height + 8)}px`;
  }

  // ── Foco ────────────────────────────────────────────────────────────────
  function enfocar(i) {
    if (!bloques.length) return;
    indice = Math.max(0, Math.min(bloques.length - 1, i));
    const b = bloques[indice];

    const act = document.activeElement;
    if (act && act !== document.body && act !== b.el && !b.el.contains(act) && esEditable(act)) act.blur();

    if (!anillo) {
      anillo = document.createElement('div');
      anillo.id = 'lector-anillo';
      anillo.setAttribute('aria-hidden', 'true');
      anillo.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #14b8a6;border-radius:6px;background:rgba(20,184,166,.1);box-shadow:0 0 0 2px rgba(15,23,42,.55),0 0 22px rgba(20,184,166,.35);display:none;transition:all .12s ease;';
      document.documentElement.appendChild(anillo);
    }
    posAnillo();
    try { b.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch { b.el.scrollIntoView?.(); }
    document.documentElement.dataset.lectorNav = `${indice + 1}/${bloques.length}`;
    actualizarMiniventana();

    const txt = `${b.rol ? b.rol + '. ' : ''}${b.txt}`;
    const fullTxt = b.rol ? `${b.rol}. ${b.txt}` : b.txt;
    pedirVoz(txt, fullTxt);
  }

  // ── Solicitud de voz (antirrebote) ─────────────────────────────────────
  // El motor local procesa una sintesis por vez y en CPU tarda 40-240 s. Si
  // cada pulsacion de Tab encolara su propia sintesis, el usuario oiria los
  // audios viejos minutos despues, uno atras de otro. El antirrebote colapsa
  // la rafaga en una sola peticion: la del bloque donde se detuvo.
  const DEBOUNCE_MS = 700;
  let hablarDebounce = null;

  function pedirVoz(txt, panelTexto, onDone) {
    if (hablarDebounce) { clearTimeout(hablarDebounce); hablarDebounce = null; }
    const seq = ++reqSeq;
    const fullTxt = panelTexto ?? txt;
    mostrarHablar(fullTxt.slice(0, 200), true);
    hablarDebounce = setTimeout(() => {
      hablarDebounce = null;
      chrome.runtime.sendMessage({ type: 'NAV_HABLAR', texto: txt, seq }, (resp) => {
        if (seq !== reqSeq) { onDone?.({ response: 'error', error: 'superseded' }); return; }
        if (resp?.ok) {
          mostrarHablar(fullTxt.slice(0, 200), false);
          // Auto-limpiar después de 25s
          if (hablarTimer) clearTimeout(hablarTimer);
          hablarTimer = setTimeout(() => finHablar(), 25000);
          onDone?.({ response: 'ok' });
        } else {
          // Error - mostrar solo 5s
          if (miniventana) {
            const dot = miniventana.querySelector('#lector-mini-dot');
            const status = miniventana.querySelector('#lector-mini-status');
            dot.style.background = '#ef4444';
            status.textContent = 'Error: ' + (resp?.error || 'desconocido');
          }
          if (hablarTimer) clearTimeout(hablarTimer);
          hablarTimer = setTimeout(() => finHablar(), 5000);
          onDone?.({ response: 'error', error: resp?.error });
        }
      });
    }, DEBOUNCE_MS);
  }

  function mover(d) {
    if (!bloques.length) return;
    const dest = indice < 0 ? (d > 0 ? 0 : bloques.length - 1) : indice + d;
    if (dest < 0 || dest >= bloques.length) return;
    // Cancelar hablar anterior
    if (hablarTimer) { clearTimeout(hablarTimer); hablarTimer = null; }
    hablarTexto = '';
    hablando = false;
    enfocar(dest);
  }

  // ── Acciones ────────────────────────────────────────────────────────────
  function activar() {
    const b = bloques[indice]; if (!b) return;
    const el = b.el, t = el.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(t)) {
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
      return;
    }
    if (PROSA.has(t)) return;
    try { el.click(); } catch {}
  }

  // ── Entrada/Salida ──────────────────────────────────────────────────────
  async function entrar() {
    if (activo) return;
    activo = true;
    if (hablarTimer) { clearTimeout(hablarTimer); hablarTimer = null; }
    hablarTexto = '';
    hablando = false;
    crearMiniventana();
    mostrarMiniventana();
    recalcular();
    if (!bloques.length) { activo = false; return; }
    const obs = new MutationObserver(() => { if (activo) recalcular(); });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__lectorNavObs = obs;
    enfocar(0);
  }

  function salir() {
    if (!activo) return;
    activo = false;
    if (hablarTimer) { clearTimeout(hablarTimer); hablarTimer = null; }
    if (hablarDebounce) { clearTimeout(hablarDebounce); hablarDebounce = null; }
    hablarTexto = '';
    hablando = false;
    window.__lectorNavObs?.disconnect();
    window.__lectorNavObs = null;
    document.querySelector('#lector-anillo')?.remove();
    document.querySelector('#lector-miniventana')?.remove();
    miniventana = null;
    delete document.documentElement.dataset.lectorNav;
  }

  // ── Teclado ─────────────────────────────────────────────────────────────
  function onKey(e) {
    if (!activo) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); salir(); return; }
    if (e.key === 'Tab') {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (esEditable(document.activeElement) && !e.shiftKey) {
        setTimeout(() => { const el = document.activeElement; if (el && el !== document.body) { let i = bloques.findIndex(b => b.el === el); if (i < 0) i = bloques.findIndex(b => b.el.contains(el)); if (i >= 0) enfocar(i); } }, 0);
        return;
      }
      e.preventDefault(); e.stopPropagation();
      mover(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Enter') {
      if (esEditable(document.activeElement)) return;
      e.preventDefault(); e.stopPropagation(); activar(); return;
    }
  }

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', posAnillo, true);

  // ── Exponer API via postMessage ───────────────────────────────────────────
  function estado() {
    return { activo, indice, total: bloques.length, rol: bloques[indice]?.rol ?? '', texto: bloques[indice]?.txt ?? '' };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.target !== 'lector-nav') return;
    const { action, payload, id } = event.data;
    try {
      if (action === 'toggle') {
        if (activo) salir(); else entrar();
        window.postMessage({ target: 'page', response: 'toggled', id }, '*');
      } else if (action === 'estado') {
        window.postMessage({ target: 'page', response: estado(), id }, '*');
      } else if (action === 'hablar') {
        // hablar directo sin pasar por enfocar
        if (!activo || !bloques.length) {
          window.postMessage({ target: 'page', response: 'error', error: 'no activo', id }, '*');
          return;
        }
        const b = bloques[indice];
        const txt = b ? (b.rol ? `${b.rol}. ${b.txt}` : b.txt) : String(payload || '');
        pedirVoz(String(payload || ''), txt, (r) => {
          window.postMessage({ target: 'page', response: r.response, error: r.error, id }, '*');
        });
      } else if (action === 'enfocar') {
        enfocar(payload);
        window.postMessage({ target: 'page', response: 'focused', id }, '*');
      } else if (action === 'mover') {
        mover(payload);
        window.postMessage({ target: 'page', response: 'moved', id }, '*');
      }
    } catch (e) {
      window.postMessage({ target: 'page', response: 'error', error: String(e), id }, '*');
    }
  });

  // ── Toggle externo (icono/atajo) ────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'NAV_TOGGLE') {
      if (activo) { activo = false; window.__lectorNavObs?.disconnect(); document.querySelector('#lector-anillo')?.remove(); document.querySelector('#lector-miniventana')?.remove(); miniventana = null; delete document.documentElement.dataset.lectorNav; }
      else { entrar(); }
    }
    if (msg?.type === 'NAV_STATUS' && msg.status === 'hablando') {
      // La sintesis ya termino y el audio empezo a reproducirse.
      if (miniventana) {
        const status = miniventana.querySelector('#lector-mini-status');
        const dot = miniventana.querySelector('#lector-mini-dot');
        if (status) status.textContent = '▶ Hablando';
        if (dot) dot.style.background = '#14b8a6';
        const texto = miniventana.querySelector('#lector-mini-texto');
        if (texto) texto.style.color = '#f1f5f9';
      }
    }
  });

})();

} catch (e) {
  console.error('[LECTOR NAV] Fatal error:', e);
}
