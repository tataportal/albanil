# Servicio del panel

La versión de GitHub Pages usa este Worker y D1 para recibir solicitudes con originales, administrar productos/stock y publicar el tipo de cambio. El destino final indicado por el usuario es el hosting cPanel de albanil.pe. Aún no se ha migrado allí este servicio: requiere adaptar su persistencia y autenticación al entorno disponible, o mantenerlo como API externa autorizando el dominio final. No publicar credenciales del hosting.

- Web: https://tataportal.github.io/albanil/propuesta/
- Panel: https://tataportal.github.io/albanil/propuesta/admin/
- API: https://albanil-settings.tatayamigos.workers.dev
- Configuración de conexión del frontend: docs/propuesta/settings.js.
- Usuario: administrador; contraseña aleatoria entregada en archivo local privado. Nunca incluirla en Git. El secreto ADMIN_PASSWORD_HASH contiene su SHA-256; este diseño exige mantener una contraseña aleatoria de alta entropía.
- Sesiones de ocho horas, token en memoria, cierre de sesión revocado en servidor. Recargar el panel requiere entrar nuevamente.

## Tres secciones independientes

Solicitudes muestra número, cliente, materiales, originales, estado, asesor y notas. Solo usuarios autenticados pueden leerlas y descargar originales. Los archivos se guardan en bloques de D1; nunca se sirven públicamente. Hasta 500 renglones, cinco archivos, 10 MB por archivo y 20 MB en total. La solicitud se confirma después de guardar todos sus datos y archivos en una transacción; los reintentos con la misma clave y contenido devuelven el mismo número. WhatsApp recibe únicamente el número y un mensaje de seguimiento. La solicitud no descuenta stock.

Productos y stock permite guardar unidad, precio, moneda y existencias. Los cambios se superponen al catálogo estático y son consultados por la web. El catálogo mantiene el precio USD original; la conversión usa el tipo de cambio compartido. Las unidades iniciales se asignaron por producto/presentación en scripts/catalog-units.json, con el criterio interno de cada asignación; el dueño puede corregirlas aquí.

Tipo de cambio permite ingresar soles por 1 US$ y pulsar Guardar y publicar cada día. Guardar el mismo valor actualiza la fecha. No requiere redeploy. Los precios anteriores de las solicitudes se conservan como fotografía al recibirlas. Las ediciones concurrentes antiguas devuelven 409.

## API

Público: GET /api/catalog, /api/exchange-rate, /api/health; POST /api/requests con Idempotency-Key; POST /api/login.

Con Bearer: GET /api/products, /api/requests, /api/requests/:reference, /api/requests/:reference/files/:id; PATCH /api/products/:id, /api/requests/:reference, /api/exchange-rate; POST /api/logout.

Las escrituras necesitan un origen permitido. Login: ocho intentos por IP/15 minutos. Solicitudes: 20 por IP/hora. Se conservan hashes temporales, no IP originales.

## Operación

Desde la raíz del repositorio:

- node --test service/cloud/worker.test.mjs scripts/tests/pricing.test.cjs scripts/tests/list-parser.test.cjs
- npx wrangler d1 execute albanil-settings --remote --config service/cloud/wrangler.jsonc --file service/cloud/schema.sql
- npx wrangler deploy --config service/cloud/wrangler.jsonc
- Configurar ADMIN_PASSWORD_HASH mediante Wrangler, manteniendo los archivos de secretos fuera de Git.

El esquema inicializa sin sobrescribir datos existentes. Conservar D1 al redesplegar. Exportar solicitudes, originales, cambios de productos y tipo de cambio antes de cualquier migración al hosting final; verificar recepción y descargas privadas allí antes del cambio público. No copiar la contraseña del hosting al frontend ni al repositorio.
