# Distribución gratuita de Lector Accesible IA

Verificado el 12/11/2026 contra las fuentes oficiales. Sin enlaces de pago.

## Cuadro de vías

| Vía | Coste | Publicación | ¿Sirve en Brave? | Veredicto |
|---|---|---|---|---|
| Chrome Web Store | **US$5** de cuota única | Revisión de Google | Sí (Brave consume la CWS) | **Descartada**: violates el presupuesto de $0 |
| Brave Web Catalog | — | — | — | **No existe**: `brave.com/webstore` y `brave.com/webcatalog` devuelven 404; el repo `brave-experiments/brave-extension-store` dice literalmente *(work in progress)* |
| Microsoft Edge Add-ons | **US$0** | Revisión de Microsoft (días) | No de forma automática (ver nota) | **Viable**: tienda real y gratuita |
| GitHub Releases | **US$0** | Inmediata | Sí, con carga descomprimida | **Recomendada para entregar ya** |
| Carga descomprimida (sideload) | **US$0** | No hace falta publicar | Sí, en Brave/Chrome/Edge | **Vía principal de los evaluadores** |

Fuentes:

- Chrome Web Store: <https://developer.chrome.com/docs/webstore/register> — *"pay a one-time registration fee"*.
- Brave no tiene tienda propia: <https://brave.com/learn/using-chrome-extensions-in-brave/> — Brave consume el Chrome Web Store, y Brave no publica un catálogo propio.
- Edge Add-ons: <https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account> — *"There is no registration fee for submitting extensions to the Microsoft Edge program."*

> Nota sobre Brave y Edge Add-ons: Edge Add-ons distribuye un instalador `.exe` de Edge, así que Brave no lo puede instalar solo. En Brave se instala la extensión descomprimida (o desde la Chrome Web Store, que exige pagar los US$5). Por eso el canal de GitHub + sideload es el que realmente sirve a este proyecto.

## Vía 1 — GitHub Releases (recomendada, entrega inmediata) — **YA HECHA**

- Repositorio: <https://github.com/SZapana/LectorAccesibleIA>
- Release `v1.1.0`: <https://github.com/SZapana/LectorAccesibleIA/releases/tag/v1.1.0>
- ZIP: <https://github.com/SZapana/LectorAccesibleIA/releases/download/v1.1.0/LectorAccesibleIA-1.1.0.zip>
- Release anterior `v1.0.1`: <https://github.com/SZapana/LectorAccesibleIA/releases/tag/v1.0.1>

El ZIP publicado se verificó descargándolo de la release y comparando su SHA256 con el archivo local: coinciden byte a byte.

Para publicar una versión nueva:

```powershell
node tools\empaquetar.js
git add -A
git commit -m "release: v1.1.0"
git tag v1.1.0
git push origin master --tags
```

y después crear la release en GitHub con el ZIP adjunto.

### Alternativas equivalentes y también gratuitas

itch.io (página de descarga), GitHub Pages (documentación + botón de descarga), o el Drive del curso.

## Vía 2 — Microsoft Edge Add-ons (tienda formal, sin cuota)

Requisitos que pide Partner Center:

- Cuenta de Partner Center. La MSA o **una cuenta de GitHub** pueden ser el Primary Owner. Sin cuota.
- Paquete `.zip` con el `manifest.json` en la raíz (el ZIP actual ya cumple).
- `description` en el manifest = short description (obligatoria, se edita en el manifest y se vuelve a subir el paquete).
- Tile PNG de 1400 × 560.
- Hasta 6 capturas de **640 × 480 o 1280 × 800**.
- Step 6 obligatorio: propósito de la extensión, justificación de cada permiso, declaración de código remoto, certificación de datos y **URL de política de privacidad**.

Los textos listos para pegar están en [`METADATOS-EDGE-ADDONS.md`](METADATOS-EDGE-ADDONS.md).

Riesgo conocido: el proxy `proxy-tts.py` no debería ir dentro del paquete de la tienda (Microsoft revisa el ZIP como si fuera código de la extensión). Subir solo la carpeta `extension/` y documentar el proxy como componente local aparte.

## Vía 3 — Carga descomprimida (la que usan los evaluadores)

Sin publicación ni cuentas. Instrucciones en [`INSTALACION-EVALUADORES.md`](INSTALACION-EVALUADORES.md) y dentro del propio ZIP (`COMO-INSTALAR.txt`).

## Lo que NO hace falta para nada de esto

- Cuenta de desarrollador de Chrome (los US$5).
- Dominio propio.
- Servidor: la voz se sintetiza en la máquina del usuario contra VoiceStudio.
