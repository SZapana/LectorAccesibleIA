# InstalaciÃƒÂ³n para evaluadores

Sin costo, sin cuentas de pago, sin internet.

## Descarga directa

**https://github.com/SZapana/LectorAccesibleIA/releases/download/v1.2.0/LectorAccesibleIA-1.2.0.zip**

(Repositorio: <https://github.com/SZapana/LectorAccesibleIA>)

## QuÃƒÂ© hay que tener

- Brave, Chrome o Edge de escritorio.
- VoiceStudio instalado y con la voz **Don IA** ya clonada.
- Python 3 (para el proxy de voz).

## Pasos

### 1. Abrir VoiceStudio

ÃƒÂbrelo y dÃƒÂ©jalo funcionando. Es el motor que sintetiza la voz en el equipo.

### 2. Iniciar el proxy

Descomprime el archivo `LectorAccesibleIA-1.2.0.zip` en una carpeta permanente (por ejemplo `Documentos\LectorAccesibleIA`) y, dentro de esa carpeta, haz doble clic en:

```
INICIAR-PROXY.bat
```

Se abre una ventana negra. **DÃƒÂ©jala abierta** mientras uses la extensiÃƒÂ³n.

ComprobaciÃƒÂ³n rÃƒÂ¡pida: abre `http://127.0.0.1:3902/health` en el navegador. Debe responder `{"status": "ok", ...}`.

### 3. Cargar la extensiÃƒÂ³n

1. Abre la pÃƒÂ¡gina de extensiones:
   - Brave: `brave://extensions`
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** y elige la carpeta del paso 2 (la que contiene `manifest.json`).

### 4. Usarla

1. Abre **cualquier** pÃƒÂ¡gina web (no estÃƒÂ¡ atada a un sitio concreto).
2. Pulsa `Alt+Shift+N` (o haz clic en el icono de la extensiÃƒÂ³n).
3. Atajos dentro del modo navegaciÃƒÂ³n:

| Tecla | AcciÃƒÂ³n |
|---|---|
| `Tab` | Bloque siguiente; al detenerte ~0,7 s, Don IA lo narra |
| `Shift+Tab` | Bloque anterior |
| `Enter` | Activa el enlace o botÃƒÂ³n del bloque; en un campo de texto, entra a escribir |
| `Escape` | Salir del modo navegaciÃƒÂ³n |

Una miniventana flotante aparece abajo a la derecha con el texto actual, el estado (Procesando / Hablando / Listo) y el contador de bloques.

Las **imÃƒÂ¡genes** se narran por su etiqueta accesible (`alt`, `aria-label` o `title`): si una foto tiene `alt="Presidente de la comunidad"`, oirÃƒÂ¡s *"Imagen. Presidente de la comunidad"*.

### Cobertura medida

El mismo cÃƒÂ³digo se probÃƒÂ³ en seis sitios de tecnologÃƒÂ­as distintas (React, MediaWiki, HTML plano, MDN, GitHub y un portal institucional). El nÃƒÂºmero de bloques detectados va de 107 a 904 segÃƒÂºn la pÃƒÂ¡gina. Los `iframe` no se narran; en los sitios medidos ninguno tenÃƒÂ­a contenido textual.

## Tiempos (importante)

La sÃƒÂ­ntesis corre en la GPU del equipo (VoiceStudio en modo `auto`):

- **Primera lectura**: entre 3 y 10 segundos (carga el modelo de voz en VRAM).
- **Lecturas siguientes**: entre 2 y 21 segundos, segÃƒÂºn el tamaÃƒÂ±o del bloque.
- **Volver a un bloque ya leÃƒÂ­do**: instantÃƒÂ¡neo, sale de la cachÃƒÂ© local.

Durante ese tiempo la miniventana queda en "Procesando voz...". No es un error: hay que esperar.

Si la GPU estÃƒÂ¡ desactivada (`compute_device: "cpu"` en `prefs.json`), los tiempos vuelven a 20-180 segundos por bloque. En el `README.md` del repositorio estÃƒÂ¡ el procedimiento para activarla.

## Problemas frecuentes

| SÃƒÂ­ntoma | Causa | SoluciÃƒÂ³n |
|---|---|---|
| `Error: TypeError: Failed to fetch` | El proxy no estÃƒÂ¡ corriendo | Abre `INICIAR-PROXY.bat` |
| `Error: 503` | VoiceStudio aÃƒÂºn arrancando | Espera un minuto y reintenta |
| `No se oye nada` | El navegador suspendiÃƒÂ³ el audio | Haz clic en la pÃƒÂ¡gina y pulsa `Enter` otra vez |
| No aparece la miniventana | El content script no cargÃƒÂ³ | Recarga la pÃƒÂ¡gina (F5) y repite |
| No funciona en `chrome://` o PDF | Son pÃƒÂ¡ginas internas | Normal: la extensiÃƒÂ³n solo actÃƒÂºa en pÃƒÂ¡ginas web |

## Nota sobre el aviso de "modo desarrollador"

Al no estar firmada, Brave/Chrome/Edge muestran un aviso al cargarla descomprimida. Es normal y no afecta el funcionamiento. Para uso diario, se puede crear un acceso directo a la pÃƒÂ¡gina de la extensiÃƒÂ³n y activar el modo desarrollador una sola vez.

## Desinstalar

Brave/Chrome/Edge Ã¢â€ â€™ pÃƒÂ¡gina de extensiones Ã¢â€ â€™ botÃƒÂ³n *Quitar* de Lector Accesible IA. Cerrar la ventana del proxy y VoiceStudio.
