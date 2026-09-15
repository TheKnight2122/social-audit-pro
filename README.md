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
- Gestion real de usuarios e integraciones desde el backend.
- Importacion normalizada de cuentas, publicaciones e historicos.

## Tecnologias utilizadas

- HTML, CSS y JavaScript modular para el frontend.
- Node.js y Express para el servidor y la API REST.
- SQLite con `better-sqlite3` para persistencia local.
- PDFKit para reportes PDF.
- `node:test` y Supertest para pruebas unitarias y de API.

## Arquitectura general

La aplicacion separa frontend, API, autenticacion, persistencia, analitica y reportes. La capa de integraciones ya almacena configuracion cifrada e importa datos normalizados; los flujos OAuth y la consulta automatica de APIs oficiales siguen pendientes de credenciales aprobadas. Ver `docs/07-arquitectura.md`.

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

Copiar `.env.example` a `.env` y reemplazar `TOKEN_ENCRYPTION_KEY` por un secreto aleatorio largo antes de cargar credenciales reales.

## Configuracion

No se deben versionar secretos ni credenciales. Las variables necesarias se documentan en `.env.example`.

## Como ejecutar el proyecto

```bash
npm start
```

Luego abrir `http://localhost:4173`.

## Como utilizarlo

En una base nueva, abrir `#/cuenta` para crear el administrador inicial. Despues se puede iniciar sesion, administrar usuarios, configurar integraciones, consultar las vistas analiticas y generar reportes PDF.

## Estado actual

Version `v0.3.0` en desarrollo: frontend analitico, API real, persistencia SQLite, autenticacion, roles, configuracion cifrada, historicos importados y exportacion PDF. Los conectores OAuth oficiales aun no realizan extraccion automatica.

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
- Reporte ejecutivo descargable en PDF.
- Quince pruebas automatizadas exitosas.

## Funcionalidades pendientes

- Flujos OAuth y conectores de lectura para las APIs oficiales.
- Renovacion automatica de tokens y sincronizacion programada.
- Sustituir los datos demo del dashboard por consultas completas a los historicos persistidos.
- Aislamiento de datos por organizacion/cliente.
- Endurecimiento para despliegue publico, recuperacion de contrasena y segundo factor.

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
- `docs/trazabilidad.md`

## Historial resumido de versiones

- `v0.0.0` - Preparacion inicial de estructura documental y trazabilidad del proyecto.
- `v0.1.0` - Formalizacion de requisitos y MVP inicial de dashboard analitico.
- `v0.2.0` - Separacion de modulos, ampliacion analitica y reporte HTML.
- `v0.3.0` - Backend, persistencia, autenticacion, roles, integraciones configurables y PDF.
