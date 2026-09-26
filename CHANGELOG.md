# Changelog

Todos los cambios importantes del proyecto se documentaran en este archivo.

El formato sigue categorias inspiradas en Keep a Changelog: Added, Changed, Fixed, Removed y Security.

## [v0.5.3] - 2026-09-26

### Security

- Bloqueo compartido entre sincronizacion manual y automatica, renovable y con propietario unico por ejecucion.
- Persistencia en transaccion solo con arrendamiento vigente, cuenta esperada y organizacion activa.
- Revalidacion de sesion y permisos antes de guardar una sincronizacion manual; OAuth consume estado atomicamente y revalida permisos.
- Descartar resultados tardios tras timeout, pausa programada, revocacion, cambio de permisos o perdida de bloqueo.
- Errores de sincronizacion persistidos sin mensajes ni tokens originales del proveedor.
- Dashboard comprueba ambas organizaciones de la asociacion; ultima sincronizacion se obtiene del registro de la organizacion.

### Added

- Dieciseis pruebas adicionales de concurrencia y seguridad entre organizaciones; total de 58 aprobadas.
- `npm run test:load`: carga HTTP autenticada con SQLite desechable y destino local exclusivo del comando.
- Carga corta en CI, evidencia JSON local y documentacion tecnica y Word.

### Limitations

- No implementa PostgreSQL, cola externa ni alta disponibilidad. SQLite sigue limitado a una instancia.
- La carga local no es una prueba de capacidad productiva ni una auditoria externa.
- El timeout impide escrituras tardias, pero un SDK que ignore cancelacion puede seguir consultando al proveedor.

## [v0.5.2] - 2026-09-26

### Added

- Logs HTTP JSON con identificador generado por el servidor, estado y duracion.
- Metricas JSON por proceso: solicitudes, errores, abortos, latencias, memoria y tiempo activo.
- Endpoint operativo desactivado sin clave y protegido por un secreto independiente.
- Ocho pruebas de monitoreo y privacidad; manual e informe semanal actualizados.
- Rotacion de logs configurada en Compose; pendiente de validacion en Docker.

### Security

- Los nuevos logs no incluyen URL, cuerpo, cookies, cabeceras ni datos de usuarios u organizaciones.
- Los errores internos no imprimen objetos de excepcion y los errores JSON no reflejan el cuerpo recibido.
- Los roles de organizaciones no conceden acceso a las metricas globales del proceso.

### Limitations

- Contadores en memoria que reinician con el proceso; sin colector, trazas ni alertas externas.
- No activa el endpoint en la instalacion local ni cambia secretos del usuario.
- No completa PostgreSQL, produccion ni alta disponibilidad.

## [v0.5.1] - 2026-09-25

### Added

- Copias online SQLite cifradas con AES-256-GCM y verificacion de integridad.
- Comandos `db:backup`, `db:verify` y `db:restore` sin sobrescritura.
- Copias periodicas opcionales y espera de la operacion activa durante el apagado.
- Guia de recuperacion, pruebas de respaldo y actualizacion documental Word.

### Security

- Clave de respaldo independiente, manifiesto autenticado y archivos privados.
- Restauracion invalida sesiones, enlaces temporales, estados OAuth y codigos de recuperacion antiguos.
- Las sincronizaciones quedan pausadas hasta revision tras recuperar una base.

### Limitations

- Copias desactivadas hasta configurar una clave privada; no se modifico `.env`.
- Pendientes almacenamiento externo, retencion, alertas y simulacros productivos.
- No sustituye la migracion a PostgreSQL ni completa la alta disponibilidad.

## [v0.5.0] - 2026-09-25

### Added

- Organizaciones, membresias y seleccion de contexto activo.
- Programaciones de sincronizacion y trabajador con arrendamiento atomico.
- Verificacion de correo, recuperacion de contrasena y MFA TOTP con codigos de recuperacion.
- Adaptadores OAuth y normalizacion para Instagram, Facebook, TikTok, LinkedIn y X.
- PKCE S256 para TikTok y X.
- Imagen Docker, Compose de referencia y endpoints de vida/disponibilidad.
- Documentacion de organizaciones, seguridad de cuentas, conectores y alta disponibilidad.

### Changed

- OAuth, sincronizacion y vista de Integraciones aceptan los seis proveedores mediante un registro comun.
- Sesiones, analitica, reportes, actividad e integraciones usan el contexto de organizacion.
- El limitador de login se almacena en SQLite y no se pierde al reiniciar el proceso.
- El servidor valida HTTPS y longitud de la clave de cifrado en modo produccion.
- La bateria automatizada aumenta a 25 pruebas.

### Security

- Tokens de verificacion y restablecimiento se guardan como hash, expiran y se consumen una vez.
- Secretos TOTP, tokens OAuth y verificadores PKCE se cifran con AES-256-GCM.
- El cambio de contrasena revoca sesiones anteriores.
- El login con MFA exige desafio temporal antes de emitir una sesion completa.

### Limitations

- Los cinco conectores nuevos requieren credenciales, permisos y validacion con cuentas reales.
- El backend productivo y la alta disponibilidad siguen pendientes de infraestructura externa y migracion desde SQLite.

## [v0.4.0] - 2026-09-20

### Added

- Primer conector oficial completo para YouTube con OAuth 2.0, YouTube Data API y YouTube Analytics API.
- Persistencia por usuario de conexiones OAuth, estados temporales y ejecuciones de sincronizacion.
- Sincronizacion idempotente de canal, videos, metricas disponibles e historicos.
- Endpoint analitico que alimenta las vistas existentes con datos oficiales del usuario conectado.
- Pruebas de OAuth, cifrado de tokens, normalizacion, sincronizacion y aislamiento por usuario.
- Manual visual en Word con capturas actuales, arquitectura, seguridad, historial, roadmap y guia de uso.
- Guia visual del codigo en Word con 21 capturas explicadas de frontend, analitica, API, seguridad, datos, integraciones, pruebas y despliegue.
- Informes Word separados para la semana actual y la anterior, con solicitudes, evidencias, resultados y pendientes.

### Changed

- Dashboard, auditoria, metricas, contenido y reportes usan datos oficiales cuando existe una cuenta de YouTube conectada.
- Las metricas que YouTube no proporciona, como alcance e impresiones en este flujo, aparecen como no disponibles y no se estiman.
- El sistema de migraciones ejecuta y registra todos los archivos SQL pendientes en orden.

### Security

- Estado OAuth aleatorio, almacenado como hash, con expiracion y uso unico.
- Tokens OAuth cifrados con AES-256-GCM y asociados al usuario propietario.
- Bloqueo de la reasignacion de una cuenta social registrada a otro usuario.

## [v0.3.0] - 2026-09-15

### Added

- API REST real con Express y endpoints versionados.
- Persistencia SQLite con migracion para usuarios, sesiones, integraciones, cuentas, publicaciones, historicos, sincronizaciones, reportes y actividad.
- Registro del administrador inicial, inicio y cierre de sesion y administracion de usuarios.
- Permisos de backend para los roles Administrador, Analista y Cliente.
- Configuracion cifrada de credenciales de integracion e importacion normalizada de datos.
- Guardado de reportes y exportacion profesional a PDF.
- Pruebas de integracion de API con Supertest.
- Compilacion estatica para publicar una demostracion visual sin alterar el entorno local.
- Publicacion automatica en GitHub Pages con cada actualizacion de `main`.

### Changed

- Configuracion e Integraciones consumen el backend en lugar de mostrar solo controles demostrativos.
- La vista de cuenta permite configurar la primera instalacion y administrar la sesion.
- La interfaz distingue automaticamente la demostracion online del sistema local con backend.

### Fixed

- El cambio de ruta vuelve al inicio de cada vista para evitar conservar una posicion de desplazamiento incorrecta.
- La paginacion del PDF evita paginas vacias y contenido fuera del area imprimible.

### Security

- Contrasenas derivadas con `scrypt` y salt individual.
- Sesiones con cookie `HttpOnly`, `SameSite=Strict`, expiracion y token CSRF.
- Credenciales cifradas con AES-256-GCM.
- Cabeceras CSP, `nosniff`, politica de referencia y proteccion de origen.

## [v0.2.0] - 2026-09-15

### Added

- Enrutamiento interno para once vistas independientes.
- Modulos demostrativos de Audiencia, Comparativas y Configuracion.
- Metricas ampliadas de impresiones, interacciones, vistas de video, CTR, frecuencia y promedios.
- Filtros de cuenta, tematica, campana y rendimiento, junto con ordenamiento de publicaciones.
- Comparativas normalizadas entre plataformas y periodos.
- Insights estructurados en dato, interpretacion, hipotesis, impacto y recomendacion.
- Reporte ejecutivo imprimible y descargable en HTML.
- Tres pruebas nuevas para filtros, patrones de contenido y comparativas.

### Changed

- El dashboard monolitico fue reemplazado por una aplicacion de vistas separadas mediante rutas hash.
- La interfaz fue redisenada para escritorio y movil con controles y tablas de dimensiones estables.
- Los estados demostrativos y las limitaciones de APIs se muestran de forma explicita.

### Fixed

- Auditoria, Metricas, Contenido e Insights ya no aparecen apilados dentro de la misma pantalla.

### Removed

- Navegacion por anclas hacia secciones de una unica pagina.

### Security

- Las conexiones reales permanecen deshabilitadas hasta implementar OAuth y almacenamiento seguro en backend.
- Se reemplazaron datos personales usados sin autorizacion por identificadores genericos de demostracion.

## [v0.0.0] - 2026-09-14

### Added

- Estructura inicial de documentacion del proyecto.
- README principal con secciones base.
- Carpeta `docs/` con documentos preparados para requisitos, arquitectura, pruebas, estado y roadmap.
- Carpeta `docs/avances/` para registrar avances individuales.
- Carpeta `docs/decisiones/` para registrar decisiones tecnicas mediante ADR.
- Matriz inicial de trazabilidad.
- `.gitignore` inicial para evitar versionar archivos temporales, dependencias y secretos.

### Changed

- No aplica.

### Fixed

- No aplica.

### Removed

- No aplica.

### Security

- Se definio la regla inicial de no versionar archivos `.env` ni credenciales reales.

## [v0.1.0] - 2026-09-15

### Added

- Formalizacion inicial de requisitos funcionales y no funcionales del sistema de auditoria de redes sociales.
- Documentacion de arquitectura objetivo, modulos, flujos, base de datos, seguridad, pruebas, despliegue, manuales, estado, roadmap y trazabilidad.
- MVP web inicial con dashboard ejecutivo, filtros, KPIs, auditoria de salud, publicaciones, anomalias y recomendaciones.
- Motor local de calculo para engagement, variaciones, puntuacion de auditoria, rankings, anomalias y recomendaciones.
- Datos demo claramente etiquetados para validar experiencia sin conectarse todavia a APIs reales.
- Pruebas unitarias con `node:test`.

### Changed

- El proyecto pasa de preparacion generica a sistema definido como Social Audit Pro.

### Fixed

- No aplica.

### Removed

- No aplica.

### Security

- Se mantiene la restriccion de no almacenar contrasenas de redes sociales ni secretos reales.
