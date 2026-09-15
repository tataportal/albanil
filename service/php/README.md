# Servicio del hosting del cliente

La web paralela usa `/nueva/` y el servicio PHP/MariaDB en `/nueva/api/`. La configuración y las fotos originales están fuera de `public_html`, en `nueva-private`. No subir credenciales a Git.

`build_release.py` prepara la web con imágenes locales y la API del mismo dominio. No reemplaza la web existente en la raíz. La publicación de GitHub Pages conserva su servicio anterior; el botón de alta solo aparece cuando la API anuncia `productCreation`.

## Alta de productos

`POST /api/products` requiere sesión de administrador, origen autorizado e `Idempotency-Key`. Recibe título, categoría existente, marca y SKU opcionales, unidad, precio, moneda, IGV, existencias, estado y una foto en base64. Valida el contenido JPG/PNG/WebP, máximo 5 MB y 6000 píxeles por lado. El servidor asigna el código bajo bloqueo de base de datos; repetir el mismo envío devuelve el mismo producto.

Los productos nuevos se guardan como registros completos en `product_overrides`. El catálogo los incorpora junto a los productos existentes. Editar precio/stock conserva todos los datos del alta. `ACTIVO` publica el producto y `INACTIVO` lo oculta en la web. Las imágenes de producto son públicas; los archivos adjuntos de solicitudes siguen siendo privados. Las fotos se sirven como imágenes desde `/api/products/{id}/image` con `nosniff`.

No convierte el precio USD almacenado: el frontend aplica el tipo de cambio compartido. Crear una solicitud no descuenta stock.

## Verificación

`product-tests.php` contiene pruebas puras de validación para ejecutar con PHP 8.3, incluyendo el servicio y llamando a `runProductTests()`. No se empaqueta ni expone como endpoint. Se verificaron además en el hosting: autenticación, creación, idempotencia, conflicto de reintento, consulta pública, descarga exacta de foto, edición sin perder datos y publicación/ocultamiento. El formulario se probó en navegador con foto; los dos registros técnicos fueron retirados después.

Pruebas JS: `node tests/request-groups.cjs` y `node scripts/tests/pricing.test.cjs`.

## Usuarios y permisos

Las cuentas del equipo se configuran fuera de `public_html`, en `config.json`, con nombre, rol, estado activo y PBKDF2-SHA256 de 600000 iteraciones con sal individual. No guardar claves en el repositorio.

- `admin`: solicitudes, productos/stock y tipo de cambio.
- `quotations`: solicitudes, seguimiento y archivos de las solicitudes.
- `catalog`: productos/stock y tipo de cambio; sin acceso a solicitudes ni adjuntos.

Las sesiones se vinculan a `sessions.username`. En cada operación se verifica la cuenta activa y su rol actual. Las sesiones anteriores sin usuario requieren volver a entrar. `GET /api/me` informa usuario y permisos; el login devuelve esa misma información para adaptar el menú. El catálogo y el tipo de cambio públicos siguen disponibles para cualquier visitante.

La migración añade `sessions.username VARCHAR(100) NULL` y `audit.actor_username VARCHAR(100) NULL`. Los registros de auditoría nuevos incluyen la cuenta responsable; no se atribuyen retroactivamente los cambios históricos. Las solicitudes muestran el último usuario que guardó el seguimiento, por separado del vendedor responsable.
