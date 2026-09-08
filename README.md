# Albañil — vista de prueba

Copia estática de la parte pública de albanil.pe, capturada el 8 de septiembre de 2026 para revisar cambios de UX/UI sin intervenir el hosting original.

**No es un clon funcional del servidor PHP ni una tienda operativa.** El carrito, envío de cotizaciones, contactos externos y pagos están desactivados. La búsqueda de esta copia funciona localmente sobre las fichas capturadas. Las imágenes que faltaban en el original se identifican con un marcador neutral. No se han aplicado el rediseño ni las mejoras comerciales del análisis.

- Publicación prevista: https://tataportal.github.io/albanil/
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
