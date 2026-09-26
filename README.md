# Social Audit Pro

## Descripcion

Plataforma web profesional para auditoria, analisis, monitoreo e interpretacion del rendimiento de redes sociales. El sistema esta orientado a empresas, agencias de marketing, community managers y supervisores que necesitan convertir datos sociales en diagnosticos y recomendaciones accionables.

## Problema que resuelve

Los equipos de marketing suelen revisar metricas dispersas en varias redes sociales sin una lectura clara de que funciona, que falla, por que ocurre y que acciones deberian priorizar. Social Audit Pro centraliza indicadores, auditorias, comparativas, anomalias, recomendaciones y reportes ejecutivos.

## Objetivo general

Desarrollar una plataforma web que permita analizar cuentas de redes sociales, interpretar su rendimiento y generar informacion estrategica para la toma de decisiones empresariales.

## Objetivos especificos

- Registrar y analizar cuentas de Facebook, Instagram, TikTok, LinkedIn, YouTube y X/Twitter segun la disponibilidad real de sus APIs.
- Calcular KPIs de comunidad, alcance, impresiones, engagement, contenido, video y conversion.
- Detectar anomalias, tendencias, fortalezas, problemas y oportunidades de mejora.
- Generar recomendaciones priorizadas con evidencia, impacto y accion sugerida.
- Preparar reportes profesionales de auditoria y rendimiento.
- Mantener trazabilidad entre requisitos, modulos, implementacion, pruebas y estado.

## Alcance

Incluye auditoria, analitica, monitoreo, insights, recomendaciones, reportes, gestion de usuarios por roles e integraciones preparadas para APIs oficiales. No incluye publicacion, programacion ni automatizacion de contenido en redes sociales.

## Principales funcionalidades

- Navegacion por vistas independientes para Dashboard, Auditoria, Metricas, Contenido, Audiencia, Comparativas, Insights, Recomendaciones, Reportes, Integraciones y Configuracion.
- Dashboard ejecutivo con salud de cuenta, KPIs, tendencias, fortalezas, problemas y acciones prioritarias.
- Auditoria por dimensiones con reglas, ponderaciones y explicaciones visibles.
- Analisis de publicaciones con filtros avanzados, ordenamiento, rankings y patrones por formato, tema y hora.
- Comparacion normalizada entre plataformas y entre periodo actual y anterior.
- Insights que separan dato observado, interpretacion, hipotesis, impacto y recomendacion.
- Reportes persistentes y exportacion profesional a PDF.
- Registro, inicio y cierre de sesion con permisos por rol.
- Verificacion de correo, recuperacion de contrasena y segundo factor TOTP con codigos de recuperacion.
- Organizaciones con miembros, seleccion de contexto y aislamiento de consultas.
- Gestion real de usuarios e integraciones desde el backend.
- Conectores OAuth para YouTube, Instagram, Facebook, TikTok, LinkedIn y X, sujetos a credenciales y aprobaciones de cada proveedor.
- Sincronizacion manual y programada con arrendamientos para impedir que dos trabajadores procesen la misma tarea.
- Importacion normalizada de cuentas, publicaciones e historicos.
- Copias SQLite cifradas, verificadas y restauracion controlada sin sobrescritura.

## Tecnologias utilizadas

- HTML, CSS y JavaScript modular para el frontend.
- Node.js y Express para el servidor y la API REST.
- SQLite con `better-sqlite3` para persistencia local.
- PDFKit para reportes PDF.
- Google APIs Node.js Client para OAuth, YouTube Data API y YouTube Analytics API.
- Nodemailer para correo, otplib para TOTP y QRCode para alta de segundo factor.
- `node:test` y Supertest para pruebas unitarias y de API.

## Arquitectura general

La aplicacion separa frontend, API, autenticacion, organizaciones, persistencia, analitica, reportes, conectores y trabajador de sincronizacion. Los seis proveedores comparten el flujo OAuth -> API oficial -> normalizacion -> SQLite -> dashboard. Ver `docs/07-arquitectura.md`.

## Estructura de carpetas

```text
.
├── docs/
│   ├── avances/
│   ├── decisiones/
│   ├── 00-descripcion-general.md
│   ├── ...
│   └── 20-roadmap.md
├── src/
│   ├── analytics.js
│   ├── app.js
│   ├── server/
│   ├── styles.css
│   └── data/
├── test/
├── index.html
├── server.js
├── package.json
├── CHANGELOG.md
├── README.md
└── .gitignore
```

## Requisitos de instalacion

- Node.js 20 o superior.
- Navegador moderno.

## Instalacion paso a paso

```bash
npm install
```

Copiar `.env.example` a `.env`, reemplazar `TOKEN_ENCRYPTION_KEY` por un secreto aleatorio largo y completar solamente las credenciales de los proveedores que se hayan registrado y aprobado.

## Configuracion

No se deben versionar secretos ni credenciales. Las variables necesarias se documentan en `.env.example`.

Cada proveedor necesita una aplicacion propia, permisos autorizados y una URL de retorno exacta. Por ejemplo, para YouTube:

```text
http://127.0.0.1:4173/api/v1/integrations/youtube/oauth/callback
```

Las variables de todos los proveedores estan descritas en `.env.example`. La guia general se encuentra en `docs/27-conectores-oficiales.md` y la guia especifica de YouTube en `docs/21-integracion-youtube.md`.

## Como ejecutar el proyecto

```bash
npm start
```

Luego abrir `http://127.0.0.1:4173`.

## Demostracion online

El comando `npm run build` genera en `dist/` una version estatica navegable para presentar visualmente el sistema. Esta demostracion no almacena usuarios ni credenciales. El servidor local conserva la API, autenticacion y persistencia completas.

GitHub Pages publica automaticamente la demostracion despues de cada cambio enviado a la rama `main`. El flujo se encuentra en `.github/workflows/deploy-pages.yml`.

## Como utilizarlo

En una base nueva, abrir `#/cuenta` para crear el administrador inicial. Despues se puede iniciar sesion, administrar usuarios, configurar integraciones, consultar las vistas analiticas y generar reportes PDF.

## Estado actual

Version `v0.5.1` en desarrollo: incluye copias cifradas y recuperacion controlada, ademas de seguridad de cuenta, organizaciones, sincronizacion automatica y adaptadores OAuth para las seis redes. YouTube conserva la validacion mas madura. Los demas conectores estan implementados y probados con respuestas simuladas, pero necesitan credenciales, permisos y pruebas con cuentas reales antes de considerarse activos en produccion. Las metricas no disponibles no se estiman.

## Funcionalidades terminadas

- Estructura documental profesional.
- Formalizacion inicial de requisitos.
- Once vistas funcionales e independientes dentro de la aplicacion.
- Dashboard, auditoria, metricas, contenido, audiencia, comparativas, insights, recomendaciones y reportes demostrativos.
- Filtros globales y filtros avanzados de contenido.
- API REST versionada bajo `/api/v1`.
- Base de datos SQLite y migracion inicial.
- Registro inicial, login, sesiones, CSRF y permisos para Administrador, Analista y Cliente.
- Usuarios, integraciones, historicos, publicaciones, reportes y actividad persistentes.
- Credenciales de integracion cifradas en reposo.
- Tokens OAuth cifrados en reposo, estado de autorizacion de un solo uso y PKCE en TikTok y X.
- Adaptadores oficiales para YouTube, Instagram, Facebook, TikTok, LinkedIn y X.
- Sincronizacion manual y automatica con intervalos configurables, bloqueo distribuido por arrendamiento y reintento controlado.
- Verificacion de correo, restablecimiento de contrasena y MFA TOTP con codigos de recuperacion.
- Organizaciones, membresias, seleccion de contexto y aislamiento de cuentas, analitica, reportes, actividad e integraciones.
- Dashboard, auditoria, metricas, contenido y reportes alimentados por datos oficiales cuando existe una cuenta conectada.
- Reporte ejecutivo descargable en PDF.
- Imagen Docker, Compose de referencia, validaciones de produccion, apagado ordenado y endpoints de vida/disponibilidad.
- Copias online cifradas, verificadas y programables; restauracion a un archivo nuevo con sesiones invalidadas y sincronizaciones pausadas.
- Treinta y cuatro pruebas automatizadas exitosas.

## Copias y recuperacion

Configurar `BACKUP_ENCRYPTION_KEY` con una clave propia de 64 caracteres hexadecimales y custodiarla fuera del servidor. No compartirla ni guardarla en Git. La copia necesita tambien conservar por separado la clave original de OAuth/MFA para la futura recuperacion.

```bash
npm run db:backup
npm run db:verify -- "backups/CARPETA-DE-LA-COPIA"
npm run db:restore -- "backups/CARPETA-DE-LA-COPIA" "data/recuperada.sqlite"
```

La restauracion no sustituye la base activa. Las copias periodicas estan desactivadas por defecto; `BACKUP_INTERVAL_HOURS=24` las habilita al reiniciar. No hay retencion automatica ni almacenamiento externo incluido. Ver `docs/29-copias-y-restauracion.md` antes de activar o restaurar.

## Funcionalidades pendientes

- Registrar aplicaciones, credenciales y permisos aprobados en cada red social y validar cada flujo con cuentas reales.
- Desplegar el backend y configurar correo SMTP, dominio HTTPS y secretos en un proveedor de produccion.
- Migrar SQLite a PostgreSQL u otra base administrada antes de ejecutar multiples instancias.
- Incorporar una cola compartida y observabilidad para alta disponibilidad completa.
- Ampliar el uso de historicos persistidos a comparativas multicuenta y datos de audiencia cuando las APIs los permitan.
- Ejecutar auditoria externa, pruebas de carga y revision de seguridad antes de almacenar informacion de clientes.

## Documentacion

La documentacion principal se encuentra en la carpeta `docs/`.

Documentos clave:

- `docs/00-descripcion-general.md`
- `docs/04-requisitos-funcionales.md`
- `docs/05-requisitos-no-funcionales.md`
- `docs/07-arquitectura.md`
- `docs/12-pruebas.md`
- `docs/19-estado-del-proyecto.md`
- `docs/20-roadmap.md`
- `docs/21-integracion-youtube.md`
- `docs/22-documentacion-word.md`
- `docs/23-informes-semanales.md`
- `docs/24-guia-visual-codigo.md`
- `docs/25-organizaciones-y-sincronizacion.md`
- `docs/26-seguridad-de-cuentas.md`
- `docs/27-conectores-oficiales.md`
- `docs/28-produccion-y-alta-disponibilidad.md`
- `docs/29-copias-y-restauracion.md`
- `docs/manuales/Manual-de-avance-Social-Audit-Pro.docx`
- `docs/manuales/Guia-visual-del-codigo-Social-Audit-Pro.docx`
- `docs/semanales/`
- `docs/trazabilidad.md`

## Historial resumido de versiones

- `v0.0.0` - Preparacion inicial de estructura documental y trazabilidad del proyecto.
- `v0.1.0` - Formalizacion de requisitos y MVP inicial de dashboard analitico.
- `v0.2.0` - Separacion de modulos, ampliacion analitica y reporte HTML.
- `v0.3.0` - Backend, persistencia, autenticacion, roles, integraciones configurables y PDF.
- `v0.4.0` - Primer conector OAuth oficial completo para YouTube y dashboard con datos reales por usuario.
- `v0.5.0` - Organizaciones, seguridad de cuenta, sincronizacion automatica, conectores multired y base de despliegue.
- `v0.5.1` - Copias cifradas verificables y restauracion controlada de SQLite.
