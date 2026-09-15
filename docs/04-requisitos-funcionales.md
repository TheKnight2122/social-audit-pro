# Requisitos funcionales

## Requisitos

- RF-001 - El sistema debe mostrar un dashboard ejecutivo con puntuacion general, estado, crecimiento, engagement, alcance, publicaciones, fortalezas, problemas y recomendaciones.
- RF-002 - El sistema debe calcular KPIs con valor actual, variacion porcentual, periodo anterior, tendencia y explicacion breve.
- RF-003 - El sistema debe auditar perfiles por presencia digital, actividad, engagement, contenido, crecimiento y rendimiento general.
- RF-004 - El sistema debe calcular una puntuacion de auditoria de 0 a 100 usando reglas y ponderaciones documentadas.
- RF-005 - El sistema debe analizar publicaciones con fecha, plataforma, tipo, descripcion, alcance, impresiones, likes, comentarios, compartidos, guardados, clics, engagement y rendimiento.
- RF-006 - El sistema debe permitir filtrar por red social, cuenta, fecha, campaña, tipo de publicacion, formato, tematica, rendimiento, audiencia y ubicacion cuando exista el dato.
- RF-007 - El sistema debe ordenar publicaciones por engagement, alcance, interaccion, mejor rendimiento y peor rendimiento.
- RF-008 - El sistema debe generar rankings Top 10 y Bottom 10 de publicaciones.
- RF-009 - El sistema debe comparar metricas entre redes sociales sin mezclar metricas no equivalentes.
- RF-010 - El sistema debe permitir comparar periodo actual contra periodo anterior.
- RF-011 - El sistema debe permitir comparar contra el mismo periodo del año anterior cuando existan datos suficientes.
- RF-012 - El sistema debe detectar anomalias como caidas de alcance, crecimiento inusual, perdida de seguidores, disminucion de engagement y publicaciones excepcionales.
- RF-013 - El sistema debe explicar cada insight separando dato observado, interpretacion, hipotesis y recomendacion.
- RF-014 - El sistema debe generar recomendaciones de alta, media y baja prioridad.
- RF-015 - El sistema debe generar reportes profesionales con resumen ejecutivo, cuentas, periodo, KPIs, evolucion, engagement, crecimiento, contenido, mejores publicaciones, problemas, fortalezas, oportunidades, recomendaciones y conclusiones.
- RF-016 - El sistema debe administrar usuarios con roles Administrador, Analista / Social Media Manager y Cliente / Supervisor.
- RF-017 - El sistema debe aplicar permisos basados en roles.
- RF-018 - El sistema debe gestionar integraciones con APIs oficiales mediante una capa independiente.
- RF-019 - El sistema debe registrar ultima sincronizacion por cuenta e informar datos desactualizados.
- RF-020 - El sistema debe indicar "Metrica no disponible para esta plataforma o nivel de acceso" cuando corresponda.
- RF-021 - El sistema debe almacenar historicos de metricas, publicaciones, auditorias, recomendaciones, reportes, sincronizaciones y actividad.
- RF-022 - El sistema no debe publicar, programar ni automatizar publicaciones en redes sociales.
- RF-023 - El sistema debe presentar Dashboard, Auditoria, Metricas, Contenido, Audiencia, Comparativas, Insights, Recomendaciones, Reportes, Integraciones y Configuracion como vistas de navegacion independientes.

## Estado de implementacion

La version v0.3.0 cubre RF-016 y RF-017 de forma funcional inicial, y avanza RF-015, RF-018, RF-019 y RF-021 mediante reportes PDF, configuracion cifrada, importacion e historicos persistentes. RF-018 y RF-019 siguen parciales hasta completar OAuth y sincronizacion automatica con cada API oficial. RF-023 esta completado en frontend y RF-022 se cumple por diseno.
