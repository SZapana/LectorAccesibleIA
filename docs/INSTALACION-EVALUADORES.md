# Instalación para evaluadores

Sin costo, sin cuentas de pago, sin internet.

## Descarga directa

**https://github.com/SZapana/LectorAccesibleIA/releases/download/v1.1.0/LectorAccesibleIA-1.1.0.zip**

(Repositorio: <https://github.com/SZapana/LectorAccesibleIA>)

## Qué hay que tener

- Brave, Chrome o Edge de escritorio.
- VoiceStudio instalado y con la voz **Don IA** ya clonada.
- Python 3 (para el proxy de voz).

## Pasos

### 1. Abrir VoiceStudio

Ábrelo y déjalo funcionando. Es el motor que sintetiza la voz en el equipo.

### 2. Iniciar el proxy

Descomprime el archivo `LectorAccesibleIA-1.1.0.zip` en una carpeta permanente (por ejemplo `Documentos\LectorAccesibleIA`) y, dentro de esa carpeta, haz doble clic en:

```
INICIAR-PROXY.bat
```

Se abre una ventana negra. **Déjala abierta** mientras uses la extensión.

Comprobación rápida: abre `http://127.0.0.1:3902/health` en el navegador. Debe responder `{"status": "ok", ...}`.

### 3. Cargar la extensión

1. Abre la página de extensiones:
   - Brave: `brave://extensions`
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** y elige la carpeta del paso 2 (la que contiene `manifest.json`).

### 4. Usarla

1. Abre **cualquier** página web (no está atada a un sitio concreto).
2. Pulsa `Alt+Shift+N` (o haz clic en el icono de la extensión).
3. Atajos dentro del modo navegación:

| Tecla | Acción |
|---|---|
| `Tab` | Bloque siguiente; al detenerte ~0,7 s, Don IA lo narra |
| `Shift+Tab` | Bloque anterior |
| `Enter` | Activa el enlace o botón del bloque; en un campo de texto, entra a escribir |
| `Escape` | Salir del modo navegación |

Una miniventana flotante aparece abajo a la derecha con el texto actual, el estado (Procesando / Hablando / Listo) y el contador de bloques.

Las **imágenes** se narran por su etiqueta accesible (`alt`, `aria-label` o `title`): si una foto tiene `alt="Presidente de la comunidad"`, oirás *"Imagen. Presidente de la comunidad"*.

### Cobertura medida

El mismo código se probó en seis sitios de tecnologías distintas (React, MediaWiki, HTML plano, MDN, GitHub y un portal institucional). El número de bloques detectados va de 107 a 904 según la página. Los `iframe` no se narran; en los sitios medidos ninguno tenía contenido textual.

## Tiempos (importante)

La síntesis corre en la CPU del equipo:

- **Primera lectura**: entre 1 y 3 minutos (carga el modelo de voz).
- **Lecturas siguientes**: entre 20 y 180 segundos, según la carga del equipo.

Durante ese tiempo la miniventana queda en "Procesando voz...". No es un error: hay que esperar.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `Error: TypeError: Failed to fetch` | El proxy no está corriendo | Abre `INICIAR-PROXY.bat` |
| `Error: 503` | VoiceStudio aún arrancando | Espera un minuto y reintenta |
| `No se oye nada` | El navegador suspendió el audio | Haz clic en la página y pulsa `Enter` otra vez |
| No aparece la miniventana | El content script no cargó | Recarga la página (F5) y repite |
| No funciona en `chrome://` o PDF | Son páginas internas | Normal: la extensión solo actúa en páginas web |

## Nota sobre el aviso de "modo desarrollador"

Al no estar firmada, Brave/Chrome/Edge muestran un aviso al cargarla descomprimida. Es normal y no afecta el funcionamiento. Para uso diario, se puede crear un acceso directo a la página de la extensión y activar el modo desarrollador una sola vez.

## Desinstalar

Brave/Chrome/Edge → página de extensiones → botón *Quitar* de Lector Accesible IA. Cerrar la ventana del proxy y VoiceStudio.
