# Metadatos listos para Microsoft Edge Add-ons

Partner Center → *Create new extension* → *Package type: Unpacked* → subir el `.zip`.

## Identidad

- **Nombre**: Lector Accesible IA
- **Short description** (va en el `manifest.json`, campo `description`):
  `Navegación por Tab con voz clonada Don IA (VoiceStudio local)`
- **Descripción de la tienda** (español):

  > Recorre cualquier página web con el teclado y escucha el texto en voz alta usando una voz clonada local. Lector Accesible IA convierte la página en bloques navegables: Tab y Shift+Tab avanzan y retroceden, Enter lee el bloque en voz alta y Escape sale del modo. Todo el procesamiento ocurre en tu equipo con VoiceStudio: el texto nunca sale de tu computadora y no se usa ningún servicio en la nube. Incluye una miniventana flotante con el texto actual, el estado de lectura y el contador de bloques.

- **Tile**: PNG de 1400 × 560.
- **Capturas**: hasta 6, de 1280 × 800. Sugerencia de secuencia:
  1. Miniventana flotante con estado "Hablando".
  2. Página con el anillo de foco sobre el bloque activo.
  3. Estado "Listo" con el contador de bloques.

## Step 6 — Privacy information

**State the extension's purpose**

> Lector Accesible IA permite leer en voz alta el contenido de una página web usando una voz clonada que se genera localmente en el equipo del usuario con VoiceStudio.

**Justify any permissions**

| Permiso | Justificación |
|---|---|
| `storage` | Guardar preferencias locales y el estado de la lectura. |
| `offscreen` | Reproducir el audio sintetizado en un documento fuera de la página, para no interferir con el audio de la web visitada. |
| `scripting` | Inyectar el script de navegación en pestañas donde el content script todavía no se ha cargado. |
| `activeTab`, `tabs` | Identificar la pestaña activa a la que aplicar el modo navegación. |
| Host permission `<all_urls>` | Leer el texto de la página visitada para dividirlo en bloques y leerlos en voz alta. Es la función central de la extensión. |
| Host permission `http://127.0.0.1:3902/*` | Conectar con el motor de voz local (VoiceStudio) que corre en la computadora del usuario. |

**Declare any use of remote code**

> La extensión no ejecuta código remoto. No descarga ni interpreta scripts de servidores externos. La única comunicación es con `http://127.0.0.1:3902`, un servicio local del propio equipo del usuario que se encarga de la síntesis de voz.

**Certify your data usage practices**

> La extensión no recopila, transmite ni vende datos personales. No hay analítica, ni telemetría, ni identificadores de seguimiento. El texto de la página se procesa íntegramente en el equipo del usuario.

**Set a privacy policy**

> URL pública al archivo `PRIVACY.md` del repositorio (publicado, por ejemplo, en GitHub Pages). El texto está en [`PRIVACY.md`](PRIVACY.md).

## Step 8 — certification testing notes

Texto sugerido para la nota de pruebas:

> The extension requires two local components on the tester machine: VoiceStudio (the local TTS engine, running on 127.0.0.1:3900) and the bundled local proxy (proxy-tts.py, running on 127.0.0.1:3902) because browser extensions cannot present a loopback web origin to the local engine. Voice cloning model: Don IA (voice id df54e121). The first synthesis loads the model and can take up to 3 minutes on CPU; later requests take 20-150 seconds. Test steps: start VoiceStudio, run `python proxy-tts.py`, verify `http://127.0.0.1:3902/health` returns `{"status":"ok"}`, load the unpacked extension, press Alt+Shift+N on any page, then press Tab and Enter.
