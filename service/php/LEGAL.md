# Privacidad y Libro de reclamaciones

El sitio del cliente publica `privacidad.html` y `reclamaciones.html`. El responsable es Albañil Home Center Eirl, RUC 20608137328. Canales: administracion@albanil.pe (privacidad) y reclamos@albanil.pe (reclamos). Los accesos a los buzones quedan fuera de Git.

## Operación

- El consumidor registra su hoja sin sesión. La numeración `LR-WEB-00000001` es correlativa bajo bloqueo de base de datos. Reintentos con el mismo contenido y clave devuelven la misma hoja.
- Cuando el consumidor indica correo, recibe automáticamente la hoja completa en el cuerpo del mensaje. Una cola transaccional reintenta fallos de entrega al servidor de correo; el estado «accepted» significa aceptado por el servidor, no lectura ni entrega garantizada al buzón. No se vuelve a enviar un mensaje ya aceptado. La respuesta al reclamo sigue siendo independiente.
- La constancia completa se puede descargar como HTML autónomo o imprimir/guardar como PDF desde el navegador. No se exige consentimiento publicitario.
- El aviso al buzón de reclamos solo contiene el número y el enlace al panel, sin datos personales del consumidor. La recepción de correo se verifica por separado de la persistencia del reclamo: un fallo de correo no elimina el registro.
- El administrador consulta el Libro en `admin/#reclamos`. Los perfiles de cotizaciones y catálogo no tienen acceso. Hay paginación de 100 registros y filtro sobre los registros cargados.
- El administrador responde por correo o carta, conforme al medio elegido. El panel registra la respuesta, fecha y referencia de la constancia de envío; no envía automáticamente la respuesta al consumidor. Debe conservarse el correo enviado o la constancia física. El plazo de respuesta es de 15 días hábiles improrrogables; no se muestra una fecha calculada sin calendario de feriados.
- No eliminar hojas para reutilizar su número. El registro conserva los datos originales y audita cambios de seguimiento. No hay borrado automático del Libro.
- Para solicitudes de derechos sobre datos personales, atender administracion@albanil.pe y verificar identidad de forma proporcional. No exigir copia de DNI en el primer contacto.

## Despliegue

Aplicar `complaints-schema.sql` y `maintenance-schema.sql` en la base privada. Publicar `complaints.php`, los cambios de `lib.php`, `index.php` y `.htaccess`, así como los módulos públicos y administrativos. No publicar `complaints-tests.php`; las pruebas usan tablas temporales que no alteran la numeración real.

## Verificación realizada

- Los cuatro usuarios originales: permisos de lectura y rechazo de escrituras fuera de su rol.
- Guardado de los valores actuales de producto 84 y cambio USD/PEN: una lectura pública independiente recibe la nueva versión, conservando valores comerciales.
- PHP en el hosting: validación de campos, representante de menor, correo/domicilio, montos, numeración e idempotencia mediante tablas temporales. Posteriormente se registró una única hoja real de prueba autorizada: LR-WEB-00000001.
- API real: anónimo 401, Productos 403, administrador 200.
- Constancia: escape de contenido, número, monto, representante y contenido completo. Flujo visual probado con receptor local, archivo HTML descargado y comprobado en disco.
- Buzones creados y acceso IMAP seguro verificado. Aviso y copia completa del reclamo autorizado LR-WEB-00000001 recibidos en reclamos@albanil.pe; verificados mediante IMAP.

## Referencias oficiales consultadas

- https://consumidor.gob.pe/libro-de-reclamaciones/ (campos, acceso, constancia y plazo).
- https://consumidor.gob.pe/wp-content/uploads/2020/07/Preguntas_Respuestas_LR_12.11.2025.pdf
- https://www.gob.pe/institucion/congreso-de-la-republica/normas-legales/243470-29733

La implementación no equivale a una certificación de Indecopi ni acredita trámites de registro de bancos de datos ante la ANPD. El cliente mantiene sus obligaciones de atención, conservación y gestión documental.

## Conservación de cotizaciones: 12 meses

- Nuevas solicitudes: `retentionClass=no_sale`. El plazo vence 12 meses calendario después de la fecha más reciente entre creación, cierre y último contacto real del cliente. No se reinicia por cambiar notas internas. El asesor registra la fecha del contacto recibido fuera de la web.
- Panel: resultado sin venta / venta / controversia y último contacto del cliente. Las solicitudes heredadas sin clasificación quedan protegidas hasta revisión por el equipo. No interpretar «Terminada» como venta automáticamente.
- Limpieza: elimina la solicitud y su resumen, adjuntos y versiones con datos personales en la auditoría. La cola de archivos permite reintentar una eliminación de disco fallida. Solo queda un recuento mensual sin referencias ni contenido de clientes.
- Ventas, controversias y el Libro no pasan por ese borrado automático; sus plazos legales requieren gestión propia. Las copias de seguridad externas deben seguir una rotación compatible, no se borran respaldos del hosting desde este proceso.
- Instalar `maintenance.php` fuera de la web en `/home/albanil/nueva-private/maintenance.php`. Cron del cliente cada cinco minutos: `/opt/cpanel/ea-php83/root/usr/bin/php /home/albanil/nueva-private/maintenance.php >> /home/albanil/nueva-private/maintenance.log 2>&1`. Reintenta correos pendientes y ejecuta limpieza una vez al día. No crear cron duplicado. Revisar el log privado ante fallos.
- Pruebas con tablas temporales: aniversario bisiesto, contactos/cierre, protección de ventas/controversias/heredadas, eliminación de adjuntos/auditoría, repetición segura, cola idempotente, fallo y reintento de correo. Ninguna prueba de borrado toca tablas reales.
