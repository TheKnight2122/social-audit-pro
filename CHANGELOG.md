# Changelog

Todos los cambios importantes del proyecto se documentaran en este archivo.

El formato sigue categorias inspiradas en Keep a Changelog: Added, Changed, Fixed, Removed y Security.

## [v0.4.0] - 2026-09-20

### Added

- Primer conector oficial completo para YouTube con OAuth 2.0, YouTube Data API y YouTube Analytics API.
- Persistencia por usuario de conexiones OAuth, estados temporales y ejecuciones de sincronizacion.
- Sincronizacion idempotente de canal, videos, metricas disponibles e historicos.
- Endpoint analitico que alimenta las vistas existentes con datos oficiales del usuario conectado.
- Pruebas de OAuth, cifrado de tokens, normalizacion, sincronizacion y aislamiento por usuario.

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
