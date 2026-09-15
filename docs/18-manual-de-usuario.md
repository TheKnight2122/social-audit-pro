# Manual de usuario

## Estado

Manual inicial para v0.3.0.

## Acceso

1. En una instalacion nueva, abrir Cuenta y registrar el administrador inicial.
2. En los siguientes accesos, iniciar sesion con correo y contrasena.
3. El Administrador puede crear usuarios desde Configuracion.
4. Los permisos disponibles dependen del rol asignado.

## Navegacion

Cada opcion del menu abre una vista independiente y cambia la ruta interna del navegador. Auditoria y Metricas, por ejemplo, no comparten la misma pantalla ni aparecen una debajo de la otra.

## Uso del dashboard

1. Abrir la aplicacion local.
2. Revisar los KPIs principales: seguidores, alcance, engagement y publicaciones.
3. Usar filtros de periodo, red social, formato y rendimiento.
4. Revisar la evaluacion de salud de cuenta.
5. Consultar hallazgos y anomalias.
6. Abrir Contenido para analizar publicaciones, campanas, temas y rankings.
7. Abrir Audiencia para revisar datos disponibles por red.
8. Abrir Comparativas para contrastar plataformas y periodos.
9. Consultar Insights y Recomendaciones para pasar del dato a la accion.
10. Usar "Generar reporte" para abrir el informe ejecutivo.
11. En Reportes, guardar el informe y descargar el PDF.

## Integraciones

1. Abrir Integraciones con un usuario Administrador o Analista.
2. Seleccionar la plataforma e ingresar la identificacion y secreto de la aplicacion oficial.
3. Guardar la configuracion; el secreto se cifra antes de persistirse.
4. La extraccion automatica requiere todavia completar el conector OAuth de la plataforma. El endpoint de importacion permite cargar datos normalizados y conservar historicos mientras se implementan esos conectores.

## Nota importante

Las vistas analiticas conservan datos demo para mostrar la experiencia completa. Usuarios, sesiones, configuracion, importaciones, historicos y reportes si usan persistencia real. La interfaz identifica el modo demo y no afirma que una API este conectada cuando no existe autorizacion OAuth.
