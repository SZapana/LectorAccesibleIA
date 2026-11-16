# DistribuciÃƒÂ³n gratuita de Lector Accesible IA

Verificado el 12/11/2026 contra las fuentes oficiales. Sin enlaces de pago.

## Cuadro de vÃƒÂ­as

| VÃƒÂ­a | Coste | PublicaciÃƒÂ³n | Ã‚Â¿Sirve en Brave? | Veredicto |
|---|---|---|---|---|
| Chrome Web Store | **US$5** de cuota ÃƒÂºnica | RevisiÃƒÂ³n de Google | SÃƒÂ­ (Brave consume la CWS) | **Descartada**: violates el presupuesto de $0 |
| Brave Web Catalog | Ã¢â‚¬â€ | Ã¢â‚¬â€ | Ã¢â‚¬â€ | **No existe**: `brave.com/webstore` y `brave.com/webcatalog` devuelven 404; el repo `brave-experiments/brave-extension-store` dice literalmente *(work in progress)* |
| Microsoft Edge Add-ons | **US$0** | RevisiÃƒÂ³n de Microsoft (dÃƒÂ­as) | No de forma automÃƒÂ¡tica (ver nota) | **Viable**: tienda real y gratuita |
| GitHub Releases | **US$0** | Inmediata | SÃƒÂ­, con carga descomprimida | **Recomendada para entregar ya** |
| Carga descomprimida (sideload) | **US$0** | No hace falta publicar | SÃƒÂ­, en Brave/Chrome/Edge | **VÃƒÂ­a principal de los evaluadores** |

Fuentes:

- Chrome Web Store: <https://developer.chrome.com/docs/webstore/register> Ã¢â‚¬â€ *"pay a one-time registration fee"*.
- Brave no tiene tienda propia: <https://brave.com/learn/using-chrome-extensions-in-brave/> Ã¢â‚¬â€ Brave consume el Chrome Web Store, y Brave no publica un catÃƒÂ¡logo propio.
- Edge Add-ons: <https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account> Ã¢â‚¬â€ *"There is no registration fee for submitting extensions to the Microsoft Edge program."*

> Nota sobre Brave y Edge Add-ons: Edge Add-ons distribuye un instalador `.exe` de Edge, asÃƒÂ­ que Brave no lo puede instalar solo. En Brave se instala la extensiÃƒÂ³n descomprimida (o desde la Chrome Web Store, que exige pagar los US$5). Por eso el canal de GitHub + sideload es el que realmente sirve a este proyecto.

## VÃƒÂ­a 1 Ã¢â‚¬â€ GitHub Releases (recomendada, entrega inmediata) Ã¢â‚¬â€ **YA HECHA**

- Repositorio: <https://github.com/SZapana/LectorAccesibleIA>
- Release `v1.2.0`: <https://github.com/SZapana/LectorAccesibleIA/releases/tag/v1.2.0>
- ZIP: <https://github.com/SZapana/LectorAccesibleIA/releases/download/v1.2.0/LectorAccesibleIA-1.2.0.zip>
- Release anterior `v1.0.1`: <https://github.com/SZapana/LectorAccesibleIA/releases/tag/v1.0.1>

El ZIP publicado se verificÃƒÂ³ descargÃƒÂ¡ndolo de la release y comparando su SHA256 con el archivo local: coinciden byte a byte.

Para publicar una versiÃƒÂ³n nueva:

```powershell
node tools\empaquetar.js
git add -A
git commit -m "release: v1.2.0"
git tag v1.2.0
git push origin master --tags
```

y despuÃƒÂ©s crear la release en GitHub con el ZIP adjunto.

### Alternativas equivalentes y tambiÃƒÂ©n gratuitas

itch.io (pÃƒÂ¡gina de descarga), GitHub Pages (documentaciÃƒÂ³n + botÃƒÂ³n de descarga), o el Drive del curso.

## VÃƒÂ­a 2 Ã¢â‚¬â€ Microsoft Edge Add-ons (tienda formal, sin cuota)

Requisitos que pide Partner Center:

- Cuenta de Partner Center. La MSA o **una cuenta de GitHub** pueden ser el Primary Owner. Sin cuota.
- Paquete `.zip` con el `manifest.json` en la raÃƒÂ­z (el ZIP actual ya cumple).
- `description` en el manifest = short description (obligatoria, se edita en el manifest y se vuelve a subir el paquete).
- Tile PNG de 1400 Ãƒâ€” 560.
- Hasta 6 capturas de **640 Ãƒâ€” 480 o 1280 Ãƒâ€” 800**.
- Step 6 obligatorio: propÃƒÂ³sito de la extensiÃƒÂ³n, justificaciÃƒÂ³n de cada permiso, declaraciÃƒÂ³n de cÃƒÂ³digo remoto, certificaciÃƒÂ³n de datos y **URL de polÃƒÂ­tica de privacidad**.

Los textos listos para pegar estÃƒÂ¡n en [`METADATOS-EDGE-ADDONS.md`](METADATOS-EDGE-ADDONS.md).

Riesgo conocido: el proxy `proxy-tts.py` no deberÃƒÂ­a ir dentro del paquete de la tienda (Microsoft revisa el ZIP como si fuera cÃƒÂ³digo de la extensiÃƒÂ³n). Subir solo la carpeta `extension/` y documentar el proxy como componente local aparte.

## VÃƒÂ­a 3 Ã¢â‚¬â€ Carga descomprimida (la que usan los evaluadores)

Sin publicaciÃƒÂ³n ni cuentas. Instrucciones en [`INSTALACION-EVALUADORES.md`](INSTALACION-EVALUADORES.md) y dentro del propio ZIP (`COMO-INSTALAR.txt`).

## Lo que NO hace falta para nada de esto

- Cuenta de desarrollador de Chrome (los US$5).
- Dominio propio.
- Servidor: la voz se sintetiza en la mÃƒÂ¡quina del usuario contra VoiceStudio.
