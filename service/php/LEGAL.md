# Privacidad y Libro de reclamaciones

El sitio del cliente publica `privacidad.html` y `reclamaciones.html`. El responsable es Albañil Home Center Eirl, RUC 20608137328. Canales: administracion@albanil.pe (privacidad) y reclamos@albanil.pe (reclamos). Los accesos a los buzones quedan fuera de Git.

## Operación

- El consumidor registra su hoja sin sesión. La numeración `LR-WEB-00000001` es correlativa bajo bloqueo de base de datos. Reintentos con el mismo contenido y clave devuelven la misma hoja.
- La constancia completa se puede descargar como HTML autónomo o imprimir/guardar como PDF desde el navegador. No se exige consentimiento publicitario.
- El aviso al buzón de reclamos solo contiene el número y el enlace al panel, sin datos personales del consumidor. La recepción de correo se verifica por separado de la persistencia del reclamo: un fallo de correo no elimina el registro.
- El administrador consulta el Libro en `admin/#reclamos`. Los perfiles de cotizaciones y catálogo no tienen acceso. Hay paginación de 100 registros y filtro sobre los registros cargados.
- El administrador responde por correo o carta, conforme al medio elegido. El panel registra la respuesta, fecha y referencia de la constancia de envío; no envía automáticamente la respuesta al consumidor. Debe conservarse el correo enviado o la constancia física. El plazo de respuesta es de 15 días hábiles improrrogables; no se muestra una fecha calculada sin calendario de feriados.
- No eliminar hojas para reutilizar su número. El registro conserva los datos originales y audita cambios de seguimiento. No hay borrado automático del Libro.
- Para solicitudes de derechos sobre datos personales, atender administracion@albanil.pe y verificar identidad de forma proporcional. No exigir copia de DNI en el primer contacto.

## Despliegue

Aplicar `complaints-schema.sql` en la base privada. Publicar `complaints.php`, los cambios de `lib.php`, `index.php` y `.htaccess`, así como los módulos públicos y administrativos. No publicar `complaints-tests.php`; las pruebas usan tablas temporales que no alteran la numeración real.

## Verificación realizada

- Los cuatro usuarios originales: permisos de lectura y rechazo de escrituras fuera de su rol.
- Guardado de los valores actuales de producto 84 y cambio USD/PEN: una lectura pública independiente recibe la nueva versión, conservando valores comerciales.
- PHP en el hosting: validación de campos, representante de menor, correo/domicilio, montos, numeración e idempotencia. No se insertaron hojas de prueba en el Libro real.
- API real: anónimo 401, Productos 403, administrador 200 y Libro vacío.
- Constancia: escape de contenido, número, monto, representante y contenido completo. Flujo visual probado con receptor local, archivo HTML descargado y comprobado en disco.
- Buzones creados y acceso IMAP seguro verificado. La prueba de recepción de aviso requiere autorización del usuario antes de enviar el mensaje técnico.

## Referencias oficiales consultadas

- https://consumidor.gob.pe/libro-de-reclamaciones/ (campos, acceso, constancia y plazo).
- https://consumidor.gob.pe/wp-content/uploads/2020/07/Preguntas_Respuestas_LR_12.11.2025.pdf
- https://www.gob.pe/institucion/congreso-de-la-republica/normas-legales/243470-29733

La implementación no equivale a una certificación de Indecopi ni acredita trámites de registro de bancos de datos ante la ANPD. El cliente mantiene sus obligaciones de atención, conservación y gestión documental.
