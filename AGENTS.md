# Guia de trabajo del repositorio

## Proposito

Social Audit Pro es una plataforma web para auditar y analizar el rendimiento de cuentas de redes sociales. Centraliza indicadores, diagnosticos, comparativas, hallazgos, recomendaciones y reportes ejecutivos.

El producto esta dirigido a empresas, agencias, community managers y supervisores. La interfaz y la documentacion se mantienen en espanol.

## Estado actual

La version actual incluye:

- Once vistas independientes para dashboard, auditoria, metricas, contenido, audiencia, comparativas, insights, recomendaciones, reportes, integraciones y configuracion.
- API REST con Node.js y Express bajo `/api/v1`.
- Persistencia local con SQLite y `better-sqlite3`.
- Registro inicial, inicio y cierre de sesion, proteccion CSRF y permisos por rol.
- Gestion persistente de usuarios, integraciones, historicos, publicaciones, reportes y actividad.
- Configuracion sensible de integraciones cifrada en reposo.
- Generacion y descarga de reportes PDF mediante PDFKit.
- Demostracion estatica publicada automaticamente en GitHub Pages.
- Pruebas automatizadas para analitica, API, autenticacion, roles y persistencia.
- Manual visual en Word con estado, capturas, arquitectura, seguridad, avances y guia de uso.

YouTube cuenta con el primer conector OAuth oficial completo; requiere credenciales propias de Google para activarse. Los conectores restantes siguen pendientes de credenciales, permisos y aprobaciones de cada plataforma.

## Version local y publica

La version local se inicia con `npm start` y queda disponible en `http://127.0.0.1:4173`. Esta version incluye el backend, la base de datos, autenticacion, permisos y exportacion PDF.

La version publica se genera con `npm run build` y se publica desde la rama `main` mediante `.github/workflows/deploy-pages.yml`:

`https://theknight2122.github.io/social-audit-pro/`

La demostracion publica es estatica. No debe almacenar usuarios, credenciales, sesiones ni informacion privada.

## Arquitectura

- `index.html`: estructura principal de la aplicacion.
- `src/app.js`: navegacion, estado y renderizado de las vistas.
- `src/styles.css`: sistema visual y comportamiento adaptable.
- `src/analytics.js`: calculos, clasificaciones y reglas de analisis.
- `src/data/`: datos demostrativos normalizados.
- `src/server/`: API, autenticacion, permisos, seguridad, persistencia y PDF.
- `migrations/`: esquema y migraciones de SQLite.
- `test/`: pruebas unitarias y de integracion.
- `docs/`: requisitos, arquitectura, seguridad, manuales, decisiones y roadmap.

## Comandos principales

```bash
npm install
npm start
npm test
npm run build
```

## Reglas de mantenimiento

- Conservar la separacion entre frontend, analitica, API y persistencia.
- Mantener cada modulo principal en una ruta independiente.
- No eliminar funcionalidades existentes al realizar cambios visuales.
- Reutilizar los patrones y variables definidos en `src/styles.css`.
- Mantener la interfaz profesional, clara, colorida y adaptable a movil.
- No incluir nombres personales, credenciales, tokens ni archivos `.env` en el repositorio.
- No simular como real una integracion que todavia no consulta una API oficial.
- Documentar formulas, supuestos y limitaciones de las metricas.
- Mantener la version publica libre de llamadas al backend local.
- Evitar cambios ajenos al objetivo de la tarea en curso.

## Trabajo pendiente prioritario

1. Reutilizar el patron OAuth de YouTube para Meta, TikTok, LinkedIn y X.
2. Programar sincronizaciones automaticas y gestionar revocaciones.
3. Sustituir progresivamente los datos demostrativos por consultas a historicos persistidos.
4. Incorporar aislamiento de datos por organizacion o cliente.
5. Endurecer el despliegue para produccion, incluyendo recuperacion de contrasena y segundo factor.

## Criterios para completar un avance

Antes de considerar terminado un cambio:

1. Ejecutar `npm test`.
2. Ejecutar `npm run build` cuando afecte al frontend o a la demostracion.
3. Verificar la vista modificada en escritorio y movil cuando sea un cambio visual.
4. Comprobar que no se hayan agregado secretos ni archivos temporales.
5. Actualizar la documentacion cuando cambie el comportamiento o el alcance.
6. Actualizar el manual Word cuando el avance modifique funciones, arquitectura, seguridad, estado o uso.
7. Registrar el avance con un commit claro y subirlo a `main` para actualizar GitHub Pages.

## Documentos de referencia

Leer primero:

- `README.md`
- `docs/07-arquitectura.md`
- `docs/15-seguridad.md`
- `docs/19-estado-del-proyecto.md`
- `docs/20-roadmap.md`
- `docs/22-documentacion-word.md`
- `docs/manuales/Manual-de-avance-Social-Audit-Pro.docx`
- `CHANGELOG.md`
