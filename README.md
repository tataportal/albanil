# Albañil — propuesta publicada en GitHub Pages

Copia estática de la parte pública de albanil.pe, capturada el 8 de septiembre de 2026 para revisar cambios de UX/UI sin intervenir el hosting original.

**No es un clon funcional del servidor PHP ni una tienda operativa.** En la referencia original, el carrito, envío de cotizaciones, contactos externos y pagos están desactivados. La búsqueda de esta copia funciona localmente sobre las fichas capturadas. Las imágenes que faltaban en el original se identifican con un marcador neutral.

## Propuesta del home

`docs/propuesta/` contiene la propuesta navegable principal. La portada de Pages (`docs/index.html`) dirige a esta versión conservando los parámetros de búsqueda y los enlaces a secciones. Conserva el logo y el verde `#b3d527`; conserva las 22 categorías originales con iconos Tabler, 18 destacados editoriales en un carrusel de tres grupos de seis (el primer grupo conserva las seis fotos retocadas), acceso destacado al armador, cuatro bloques por rubro y explicación del recorrido de cotización. El contacto real por WhatsApp es `+51 968 406 042`, disponible en el pie y en un botón flotante fijo; la lista de prueba no se envía automáticamente.

- Buscar y filtrar las 612 fichas públicas, con paginación y vista rápida del producto.
- Agregar, editar cantidades y quitar productos de una lista guardada en el navegador (`albanil-propuesta-cotizacion-v1`).
- Revisar y descargar una lista de prueba. No hay envío a la tienda, datos personales, pagos ni API de IA.
- Los destacados no representan un ranking de ventas o margen. No se presentan precios ni stock de la captura como vigentes.
- Los seis destacados usan versiones sin marcas superpuestas ni bordes incrustados en `assets/products/clean-v2/`. Los originales se conservan.
- HTML, CSS y JavaScript locales; Barlow y Tabler están incluidos con sus licencias. La fuente de datos es exclusivamente el HTML público saneado.

Para revisar: `python3 -m http.server 8087 --bind 127.0.0.1 --directory docs`, y abrir http://127.0.0.1:8087/propuesta/.

Para regenerar el catálogo y el HTML: `python3 scripts/build-home.py`. Requiere `cwebp` solo si faltan las versiones WebP de los destacados. Editar `scripts/home.template.html` para modificar el HTML, y `docs/propuesta/home.css` / `home.js` para estilos y comportamiento.

La publicación utiliza `main`. La web anterior completa se conserva en la rama `backup/web-original-2026-09-09`, basada en el commit `309d7879e59442aa478c0bbd190bd1de6607a3c3`. Para consultar o restaurar esa versión, usar dicha rama; no mezclarla con la propuesta. `scripts/original-home.html` conserva el menú fuente que utiliza el generador, y las fichas HTML originales siguen siendo la fuente pública del catálogo.

- Sitio: https://tataportal.github.io/albanil/
- GitHub Pages publica únicamente `docs/` desde `main`.
- `docs/snapshot.json` describe la cobertura y recursos que faltan.
- No se incluyen PHP, contraseñas, tokens, base de datos, información de clientes ni informes privados.
- El repositorio y la vista de prueba son públicos, por indicación del usuario. La copia muestra un aviso y directivas noindex; estas directivas no son control de acceso.

## Flujo de edición

1. Crear una rama `codex/nombre-del-cambio`.
2. Editar y revisar la vista estática local; publicar la versión aprobada de prueba en Pages.
3. Tras la aprobación del diseño, portar los cambios a una copia privada del PHP real y probarlos con una base de datos de pruebas independiente.
4. Antes de producción, descargar la versión vigente de cada archivo afectado y compararla con la base original; resolver cualquier modificación del proveedor.
5. Respaldar y subir únicamente los archivos aprobados. Nunca sincronizar la carpeta completa ni sobrescribir productos, fotos nuevas, cotizaciones o configuración.
6. Comprobar el flujo real y conservar un rollback de los archivos sustituidos.

La copia completa de PHP y de una base de datos de pruebas aún está pendiente; no debe presentarse como respaldo recuperable. La vista estática no se sube directamente encima del sitio PHP original.

## Revisión local

Ejecutar `python3 -m http.server 8080 --directory docs` y abrir http://localhost:8080/.

### Armador de listas

`/propuesta/?lista=1` permite pegar renglones o buscar productos para armar la misma cotización del catálogo. Funciona con reglas locales, sin IA, APIs de modelos ni créditos. Las coincidencias se confirman; cantidades y unidades se pueden corregir y los materiales pendientes mantienen su texto original. El borrador y la cotización se guardan en el navegador. La descarga de texto incluye productos, unidades y pendientes; no hay envío de pedidos ni panel implementado.

Validación del reconocimiento: `node scripts/tests/list-parser.test.cjs`.

## Publicación y respaldo

El usuario autorizó publicar esta propuesta en GitHub Pages el 9 de septiembre de 2026. Se mantiene el hosting PHP de albanil.pe sin cambios.

- Web principal: https://tataportal.github.io/albanil/
- Respaldo de la web anterior: https://github.com/tataportal/albanil/tree/backup/web-original-2026-09-09
- Pages: rama `main`, directorio `/docs`; no requiere compilación en GitHub.
- Validación antes de publicar: regenerar con `python3 scripts/build-home.py`, ejecutar `node scripts/tests/list-parser.test.cjs` y revisar sintaxis de los JavaScript.

La selección de productos permite comparar fotos y precios de referencia de la captura del 8 de septiembre; el flete se consulta al final. Agregar desde el catálogo pide una cantidad entera. Las listas con medidas explícitas como metros o kilos admiten decimales. El envío a la tienda y un panel de solicitudes siguen pendientes.
