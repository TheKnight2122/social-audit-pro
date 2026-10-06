# Entrega Tecnica

## Social Audit Pro

Plataforma web para auditoria y analisis de rendimiento en redes sociales. Centraliza indicadores, diagnosticos, hallazgos, recomendaciones y reportes para empresas, agencias y equipos de marketing.

## Integrantes

Completar antes de enviar por el canal interno:

- Integrante 1: [NOMBRE COMPLETO]
- Integrante 2: [NOMBRE COMPLETO]
- Integrante 3: [NOMBRE COMPLETO]

Los nombres se mantienen fuera del repositorio publico por privacidad.

## Enlaces

- Repositorio: https://github.com/TheKnight2122/social-audit-pro
- Demostracion publica: https://theknight2122.github.io/social-audit-pro/
- Ejecucion local: `http://127.0.0.1:4173`

## Problema

Las metricas de redes sociales suelen estar repartidas entre distintas plataformas. Social Audit Pro las organiza en una sola interfaz y ayuda a interpretar resultados mediante KPIs, auditorias, comparativas, hallazgos y recomendaciones.

## Funciones implementadas

- Once vistas: dashboard, auditoria, metricas, contenido, audiencia, comparativas, insights, recomendaciones, reportes, integraciones y configuracion.
- Dashboard ejecutivo con KPIs, salud de cuenta, tendencia, problemas y acciones prioritarias.
- Analisis de contenido por formato, tema, hora, rendimiento y filtros.
- Reportes persistentes y exportacion PDF.
- Registro, inicio y cierre de sesion, roles de administrador, analista y cliente, proteccion CSRF, verificacion de correo, recuperacion de contrasena y 2FA TOTP.
- Organizaciones y aislamiento de usuarios, cuentas, publicaciones, historicos, actividad, reportes e integraciones.
- Sincronizacion manual y programada con bloqueo para evitar ejecuciones duplicadas.
- Copias locales cifradas, restauracion controlada y monitoreo basico del proceso.

## Arquitectura y tecnologias

El frontend usa HTML, CSS y JavaScript modular. Node.js con Express expone la API REST bajo `/api/v1`. SQLite, mediante `better-sqlite3`, es la base de datos activa de la instalacion local. El proyecto incluye esquema, herramienta de traslado y adaptadores iniciales para PostgreSQL, pero el runtime completo todavia no usa PostgreSQL.

Los modulos principales estan separados en presentacion, analitica, API, identidad, organizaciones, persistencia, integraciones, sincronizacion y reportes. Las credenciales de integracion y los tokens OAuth se cifran antes de persistirse.

Tecnologias adicionales: PDFKit para informes, Nodemailer y Microsoft Graph preparado para correo, otplib y QRCode para 2FA, Google APIs para YouTube, GitHub Actions para pruebas y GitHub Pages para la demostracion estatica.

## Redes sociales

El sistema prepara conectores para YouTube, Facebook, Instagram, TikTok, LinkedIn y X. YouTube tiene el conector OAuth mas avanzado. Facebook, Instagram, TikTok, LinkedIn y X requieren aplicaciones registradas, credenciales, permisos aprobados y pruebas con cuentas reales. X permanece desactivado hasta aprobar sus costes.

## Version local y demostracion publica

La version local incluye el backend, SQLite, autenticacion, permisos, persistencia y PDF. Se inicia con:

```bash
npm install
npm start
```

La demostracion publica se genera con `npm run build` y se publica en GitHub Pages al enviar cambios a `main`. Es estatica: permite revisar la interfaz y los datos de demostracion, pero no ejecuta login, base de datos, sincronizaciones ni datos privados.

## Evidencia de calidad

La version documentada v0.5.8 registra 105 pruebas automatizadas aprobadas. Incluye pruebas de analitica, API, autenticacion, roles, organizaciones, aislamiento de datos, persistencia, correo simulado, recuperacion, 2FA y adaptadores PostgreSQL. Tambien existe una prueba local desechable de 200 solicitudes concurrentes y un flujo de GitHub Actions que ejecuta pruebas antes de publicar la demostracion.

## Estado actual y pendientes

Social Audit Pro funciona como MVP avanzado local. No es aun un servicio SaaS desplegado. Para produccion faltan credenciales y aprobaciones oficiales de cada red, pruebas con cuentas reales, configuracion de Microsoft 365 o SMTP, despliegue de backend y base de datos, migracion completa a PostgreSQL, cola compartida, almacenamiento externo de copias, alertas y pruebas productivas de seguridad y carga.

## Documentacion de referencia

- `README.md`
- `docs/07-arquitectura.md`
- `docs/08-base-de-datos.md`
- `docs/12-pruebas.md`
- `docs/15-seguridad.md`
- `docs/19-estado-del-proyecto.md`
- `docs/20-roadmap.md`
- `docs/27-conectores-oficiales.md`
- `docs/34-traslado-postgresql.md`
- `docs/35-acceso-asincrono-postgresql.md`
- `docs/36-recuperacion-postgresql.md`
