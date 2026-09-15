# Changelog

Todos los cambios importantes del proyecto se documentaran en este archivo.

El formato sigue categorias inspiradas en Keep a Changelog: Added, Changed, Fixed, Removed y Security.

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
