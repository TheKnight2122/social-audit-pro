# Base de datos

## Estado

Diseno conceptual inicial. El MVP aun no implementa persistencia real.

## Entidades principales

- users: usuarios del sistema.
- roles: roles y permisos.
- social_networks: redes sociales soportadas.
- social_accounts: cuentas conectadas o importadas.
- posts: publicaciones analizadas.
- metrics: metricas historicas por cuenta, publicacion y periodo.
- periods: rangos de analisis.
- audits: resultados de auditoria.
- recommendations: recomendaciones generadas.
- reports: reportes ejecutivos.
- sync_jobs: sincronizaciones con APIs.
- activity_logs: registro de acciones relevantes.

## Relaciones

```mermaid
erDiagram
    USERS ||--o{ SOCIAL_ACCOUNTS : manages
    ROLES ||--o{ USERS : assigns
    SOCIAL_NETWORKS ||--o{ SOCIAL_ACCOUNTS : supports
    SOCIAL_ACCOUNTS ||--o{ POSTS : contains
    SOCIAL_ACCOUNTS ||--o{ METRICS : has
    POSTS ||--o{ METRICS : has
    PERIODS ||--o{ AUDITS : evaluates
    SOCIAL_ACCOUNTS ||--o{ AUDITS : audited
    AUDITS ||--o{ RECOMMENDATIONS : produces
    AUDITS ||--o{ REPORTS : summarizes
    SOCIAL_ACCOUNTS ||--o{ SYNC_JOBS : syncs
    USERS ||--o{ ACTIVITY_LOGS : creates
```

## Restricciones iniciales

- No guardar contrasenas de redes sociales.
- Tokens de API cifrados.
- Historicos preservados por periodo.
- Evitar duplicidad usando identificadores externos por red social y cuenta.
- Registrar fecha de ultima sincronizacion.
