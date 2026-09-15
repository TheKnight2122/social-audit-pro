# Flujos del sistema

## Flujo de analisis objetivo

```mermaid
sequenceDiagram
    actor Usuario
    participant FE as Frontend
    participant API as Backend
    participant INT as Integraciones
    participant DB as Base de datos
    participant ANA as Motor analitico

    Usuario->>FE: Selecciona cuenta y periodo
    FE->>API: Solicita datos
    API->>DB: Consulta metricas historicas
    API->>ANA: Calcula KPIs, auditoria e insights
    ANA-->>API: Resultados interpretados
    API-->>FE: Dashboard y recomendaciones
    FE-->>Usuario: Visualiza diagnostico
```

## Flujo de sincronizacion objetivo

1. El usuario autorizado conecta una cuenta mediante mecanismo oficial.
2. El sistema almacena token de forma segura.
3. El servicio de integracion solicita metricas disponibles.
4. El procesamiento normaliza datos y detecta metricas no disponibles.
5. La base de datos guarda historicos y ultima sincronizacion.
6. El dashboard informa fecha y estado de actualizacion.

## Flujo del MVP actual

1. El usuario abre el dashboard.
2. La aplicacion carga datos demo locales.
3. El motor analitico calcula KPIs, auditoria, rankings, anomalias y recomendaciones.
4. Los filtros actualizan la interfaz dinamicamente.
