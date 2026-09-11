# Piloto local de solicitudes Albañil

Python estándar + SQLite, solo `127.0.0.1`. No desplegar este servidor de desarrollo directamente en Internet.

- Ejecutar `python3 service/seed_demo.py` para crear 3 solicitudes ficticias en `.local/dashboard-demo.sqlite3`.
- Ejecutar `python3 service/server.py --port 8098 --db .local/dashboard-demo.sqlite3`; pide una contraseña de al menos 12 caracteres. También admite `ALBANIL_ADMIN_PASSWORD` como variable de entorno.
- Builder: http://127.0.0.1:8098/propuesta/?lista=1
- Panel: http://127.0.0.1:8098/propuesta/admin/
- Pruebas: `python3 -m unittest discover -s service -p 'test_*.py' -v`

El builder detecta el receptor local, pide contacto y consentimiento, guarda materiales y originales en una transacción y obtiene un número solo tras confirmar el registro. Reintentos idénticos usan la misma clave. WhatsApp comunica el número; no adjunta archivos ni envía mensajes automáticamente. Las solicitudes no descuentan ni reservan stock.

El panel exige sesión; tiene búsqueda, estados, responsable, notas internas y descarga privada de originales. Los cambios de seguimiento usan control de versión y auditoría. Los contadores reflejan las últimas 500 solicitudes cargadas; nuevas y pendientes pueden solaparse. La recepción admite hasta 500 materiales y 5 archivos (10 MB cada uno, 20 MB total). Cantidad desconocida se conserva como pendiente. Coincidencias sugeridas no son equivalencias confirmadas.

Precio/stock es un módulo separado. SKU opcional. El catálogo local lee esos cambios en los servicios de puertos 8092 y 8098.

Pendiente antes de uso real: decidir alojamiento, HTTPS y servidor de producción, usuarios individuales y recuperación de acceso, copias y retención de datos, límites operativos/antispam, paginación completa y acceso remoto. No publicar bases, contraseñas ni archivos de clientes. `.local/` está excluido de Git y el servidor solo sirve archivos de `docs/` y las rutas privadas autenticadas.

## Demostración pública

GitHub Pages publica `/propuesta/admin/` con tres solicitudes sintéticas de `demo.json`. Permite probar filtros, seguimiento y edición de productos en memoria; recargar restaura los ejemplos. No hay acceso a la base privada ni envíos a los teléfonos ficticios. Los archivos de demostración son ficticios. El builder público conserva el flujo manual por WhatsApp hasta conectar el receptor privado.
