# Lector Accesible IA

Extensión de navegador (Chrome/Brave/Edge, Manifest V3) que permite recorrer una página web **con el teclado** y escucharla en voz alta usando una **voz clonada local**.

- **Voz**: Don IA (`df54e121`), clonada dentro de VoiceStudio en el equipo del usuario.
- **Sin nube**: ni el texto ni el audio salen de la computadora.
- **Navegación por Tab**: `Tab` / `Shift+Tab` recorren los bloques, `Enter` activa el enlace o botón donde estás parado, `Escape` sale.
- **Miniventana flotante** con el texto actual, el estado (Procesando / Hablando / Listo) y el contador de bloques.

![Miniventana flotante de Lector Accesible IA](docs/captura-miniventana.png)

## v1.0.1 — navegar ya no acumula voces

El motor local procesa **una** síntesis a la vez y en CPU tarda 40-240 s. En la v1.0.0, cada pulsación de `Tab` encolaba su propia síntesis: cuatro `Tab` seguidos dejaban **5 voces en la cola** (medido: `5 synthesize start`, `0 completadas`) y el usuario terminaba oyendo audios viejos, uno tras otro, minutos más tarde.

La v1.0.1 lo corrige en tres capas:

| Capa | Qué hace |
|------|----------|
| `content/navegacion.js` | Antirrebote de 0,7 s: una ráfaga de `Tab` se colapsa en **una sola** petición, la del bloque donde el usuario se detuvo. |
| `background/service-worker.js` | Un trabajo activo a la vez: al llegar una petición nueva se aborta la anterior y su audio **no se reproduce**. |
| `proxy-tts.py` | `ThreadingHTTPServer`: el proxy deja de bloquearse con una síntesis en curso (`/health` respondía solo al terminar) y sobrevive a la desconexión del cliente. |

Verificado en Brave contra `https://muni-theta.vercel.app/` (102 bloques detectados):

```
4 Tab en 2,4 s   ->  1 petición en cola  (antes: 5)
/health durante la síntesis -> {"status": "ok", ...}   (antes: se bloqueaba)
```

## Estado verificado (12/11/2026)

Prueba end-to-end en Brave con el ZIP de distribución:

```
synthesize start len=167
synthesize end 530052 bytes 59393ms
playAudio start
playAudio fin          (11,4 s = 264 810 muestras a 24 kHz)
miniventana: Procesando voz... -> ▶ Hablando -> Listo
```

## Descarga

- Repositorio: <https://github.com/SZapana/LectorAccesibleIA>
- Release `v1.0.1`: <https://github.com/SZapana/LectorAccesibleIA/releases/tag/v1.0.1>
- ZIP: <https://github.com/SZapana/LectorAccesibleIA/releases/download/v1.0.1/LectorAccesibleIA-1.0.1.zip>
- Release `v1.0.0` (anterior): <https://github.com/SZapana/LectorAccesibleIA/releases/tag/v1.0.0>

## Estructura

```
extension/                 código que se empaqueta
  manifest.json            permisos y puntos de entrada
  background/              service worker: síntesis, offscreen, comandos
  content/navegacion.js    extracción de bloques, atajos, miniventana
  offscreen/               reproducción del audio (Web Audio 24 kHz mono)
  proxy-tts.py             proxy local de voz (3902 -> VoiceStudio 3900)
tools/
  empaquetar.js            genera dist/LectorAccesibleIA-<version>.zip
  INICIAR-PROXY.bat        lanzador del proxy para el usuario final
docs/
  COMO-INSTALAR.txt        instrucciones que viajan dentro del ZIP
  INSTALACION-EVALUADORES.md
  DISTRIBUCION-GRATUITA.md vías de publicación sin costo
  METADATOS-EDGE-ADDONS.md  textos listos para Microsoft Edge Add-ons
  PRIVACY.md               política de privacidad
dist/                      ZIP de distribución
```

## Arquitectura en una línea

`content script` (lee bloques) → `service worker` (pide voz a VoiceStudio vía proxy local) → `documento offscreen` (reproduce el PCM) → estado visible en la miniventana.

El proxy local es **imprescindible**: el navegador no puede presentar un origen `chrome-extension://` al motor local, y VoiceStudio rechaza esas peticiones por CSRF. Además, el allow-list `OMNIVOICE_ALLOWED_ORIGINS` de VoiceStudio solo acepta esquemas `http`, `https` y `app`, así que no se puede eliminar el proxy por configuración.

## Requisitos para probar

VoiceStudio abierto, `python proxy-tts.py` corriendo, y la extensión cargada descomprimida. Instrucciones: [`docs/INSTALACION-EVALUADORES.md`](docs/INSTALACION-EVALUADORES.md).

## Empaquetar

```powershell
node tools\empaquetar.js
```

Genera `dist/LectorAccesibleIA-1.0.0.zip` con el `manifest.json` en la raíz, el proxy incluido y el instructivo.
