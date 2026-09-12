# Consolidado de productos

Fuente: Consolidado_Productos_Albanil.xlsx, hoja Productos. Se importa PRECIO WEB, no PRECIO TIENDA. Los formatos de moneda del archivo distinguen PEN y USD; el usuario confirmó que el precio USD se conserva y solo cambia la variable de conversión.

554 filas: 468 actualizaciones de IDs existentes y 86 productos nuevos. 14 precios USD, 33 productos sin importe por indicación de consultar al asesor, 84 sin stock. Un producto INACTIVO se conserva en datos/admin pero no se ofrece en la web. Los 144 productos anteriores no incluidos conservan sus enlaces; no se publican sus importes históricos como precios vigentes.

El ID 340 ya pertenece al tapón. La varilla distinta recibe referencia 340-2 e identificador interno 100085. Las filas sin ID reciben referencias N-0001 en adelante. Son referencias de catálogo, no SKU oficial. catalog-id-map.json conserva las asignaciones entre importaciones; no eliminarlo ni regenerar los IDs por posición de fila.

Los productos nuevos sin foto usan Foto pendiente. No se toman fotos de otro producto aunque tenga un nombre parecido. MADERA Y PLASTICOS se incorpora como categoría adicional del archivo y conserva las 22 categorías anteriores.

Ejecutar import-consolidated.py con Python que tenga openpyxl para lectura. El resultado consolidated-products.json solo contiene datos de venta web. Luego ejecutar build-home.py y las pruebas scripts/tests/*.test.cjs. El Excel original no se modifica ni se publica.

El home consulta el tipo de cambio compartido en Cloudflare; el valor inicial es S/3.40. La activación de credenciales de escritura sigue pendiente de la autorización solicitada. El dashboard publicado muestra los datos importados pero sus botones Aplicar en este navegador aún no guardan remotamente. La versión preparada de acceso con usuario se conserva fuera de publicación en .local/dashboard-auth-pending-admin.js y .local/dashboard-auth-pending-index.html; integrarla solo después de activar y verificar la credencial, manteniendo las correcciones de importación.
