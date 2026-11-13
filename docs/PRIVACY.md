# Política de privacidad de Lector Accesible IA

**Versión 1.1.0 — 13 de noviembre de 2026**

## Resumen

Lector Accesible IA no recopila, transmite, almacena en servidores ni vende ningún dato. Todo el procesamiento ocurre en el equipo de la persona usuaria.

## Qué hace la extensión

1. Lee el texto de la página web que está abierta en el navegador, en cualquier sitio (el script se inyecta en `<all_urls>`).
2. Lo divide en bloques y permite recorrerlos con el teclado.
3. Cuando un bloque es una imagen, usa su etiqueta accesible (`alt`, `aria-label` o `title`) como texto del bloque.
4. Envía el texto del bloque seleccionado a un motor de voz **local** (VoiceStudio), que corre en la computadora de la persona usuaria.
5. Reproduce el audio sintetizado.

## Dónde se procesan los datos

- **Texto de la página**: se procesa en el navegador, en la memoria de la pestaña. No se envía a ningún servicio.
- **Texto que se sintetiza**: viaja por la red local (`127.0.0.1`) hasta VoiceStudio, que corre en el mismo equipo. No sale del equipo.
- **Audio generado**: se reproduce en el equipo. No se guarda en ningún servidor.

## Datos que no se recopilan

- No hay cuentas de usuario.
- No hay analítica, telemetría ni métricas de uso.
- No hay identificadores de seguimiento, cookies ni perfiles.
- No hay publicidad ni terceros que muestren anuncios.
- No hay servers remotos, ni descarga de código remoto.

## Permisos y su motivo

| Permiso | Motivo |
|---|---|
| `storage` | Preferencias locales y estado de la lectura. |
| `offscreen` | Reproducir el audio fuera de la página, sin interferir con el audio de la web visitada. |
| `scripting` | Inyectar el script de navegación en pestañas donde aún no se ha cargado. |
| `activeTab`, `tabs` | Identificar la pestaña activa a la que aplicar el modo navegación. |
| `<all_urls>` | Leer el texto de la página visitada para poder leerlo en voz alta. |
| `http://127.0.0.1:3902/*` | Conectar con el motor de voz local del propio equipo. |

## Componentes locales

- **VoiceStudio**: motor de síntesis de voz local. La voz "Don IA" (`df54e121`) está clonada dentro de la aplicación, en el equipo.
- **Proxy local** (`proxy-tts.py`, 127.0.0.1:3902): reenvía la petición de voz con el origen loopback que el motor exige. No sale a internet.

## Eliminación de datos

La extensión no guarda datos personales. La única información persistente es la configuración local del navegador (preferencias de la extensión) y los datos que ya existían en VoiceStudio antes de instalarla.

## Cambios en esta política

Cualquier cambio se publicará en este mismo archivo, indicando la nueva versión y la fecha.

## Contacto

Para consultas sobre privacidad: escribir al responsable del proyecto mediante el repositorio público donde se distribuye la extensión.
