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

- Dashboard ejecutivo con salud de cuenta, KPIs, tendencias y recomendaciones.
- Auditoria por dimensiones: presencia digital, actividad, engagement, contenido, crecimiento y rendimiento general.
- Analisis de publicaciones, rankings de contenido y comparativas entre plataformas.
- Deteccion de anomalias basada en comportamiento historico.
- Reportes ejecutivos para gerencia, clientes o equipos.
- Gestion conceptual de integraciones y ultima sincronizacion.

## Tecnologias utilizadas

- HTML, CSS y JavaScript modular para el MVP inicial.
- Node.js para servidor local y pruebas automatizadas.
- `node:test` para pruebas unitarias de formulas e insights.

## Arquitectura general

La arquitectura objetivo separa frontend, backend, servicios de integracion, procesamiento analitico y base de datos. El MVP actual implementa la capa visual y analitica inicial con datos demo controlados. Ver `docs/07-arquitectura.md`.

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

El proyecto no requiere dependencias externas en esta primera version, pero el comando mantiene el flujo estandar de Node.js.

## Configuracion

No se deben versionar secretos ni credenciales. Las variables necesarias se documentan en `.env.example`.

## Como ejecutar el proyecto

```bash
npm start
```

Luego abrir `http://localhost:4173`.

## Como utilizarlo

El MVP muestra un dashboard con datos demo etiquetados. Permite cambiar periodo, red social, formato y nivel de rendimiento para actualizar KPIs, publicaciones, anomalias y recomendaciones.

## Estado actual

MVP inicial en desarrollo: documentacion formal creada, requisitos trazados y primera interfaz funcional con calculos locales sobre datos demo.

## Funcionalidades terminadas

- Estructura documental profesional.
- Formalizacion inicial de requisitos.
- Dashboard MVP con KPIs, auditoria, publicaciones, insights y recomendaciones.
- Pruebas unitarias de formulas principales.

## Funcionalidades pendientes

- Backend real.
- Base de datos persistente.
- Autenticacion y autorizacion reales.
- Integraciones oficiales con APIs de redes sociales.
- Generacion/exportacion real de reportes.
- Cifrado y almacenamiento seguro de tokens.

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
