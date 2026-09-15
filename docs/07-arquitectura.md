# Arquitectura

## Estado

Arquitectura objetivo definida. El MVP actual implementa frontend estatico modular con motor analitico local y datos demo. Las capas de backend, persistencia e integraciones se implementaran en fases posteriores.

## Diagrama general objetivo

```mermaid
flowchart TD
    U[Usuario] --> FE[Frontend web]
    FE --> API[Backend/API]
    API --> AUTH[Autenticacion y autorizacion]
    API --> ANA[Motor analitico]
    API --> REP[Servicio de reportes]
    API --> INT[Capa de integraciones]
    INT --> FB[Facebook API]
    INT --> IG[Instagram API]
    INT --> TT[TikTok API]
    INT --> LI[LinkedIn API]
    INT --> YT[YouTube API]
    INT --> X[X/Twitter API]
    INT --> PROC[Procesamiento y normalizacion]
    PROC --> DB[(Base de datos)]
    ANA --> DB
    REP --> DB
    API --> DB
```

## Componentes

- Frontend web: dashboard, filtros, tablas, recomendaciones, reportes e integraciones.
- Backend/API: reglas de negocio, autorizacion, orquestacion de datos y exposicion de endpoints.
- Capa de integracion: conectores independientes por red social.
- Motor analitico: formulas, auditoria, deteccion de anomalias, rankings e insights.
- Base de datos: usuarios, roles, cuentas, publicaciones, metricas, historicos, reportes y actividad.
- Servicio de reportes: generacion de informes ejecutivos.

## Comunicacion entre modulos

El flujo previsto es:

```text
Frontend -> Backend -> Servicio de integracion -> API social -> Procesamiento -> Base de datos -> Dashboard
```

## Servicios externos

APIs oficiales de redes sociales. La disponibilidad de metricas depende de cada API y del nivel de permisos aprobado.

## Arquitectura del MVP

```mermaid
flowchart LR
    HTML[index.html] --> APP[src/app.js]
    APP --> ANALYTICS[src/analytics.js]
    APP --> DATA[src/data/sampleData.js]
    TEST[test/analytics.test.js] --> ANALYTICS
```
