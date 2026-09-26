# Avance 013 - Monitoreo operativo y privacidad

Fecha: 2026-09-26. Version: v0.5.2.

## Resultado

- Registros HTTP JSON con campos permitidos y correlacion generada por el servidor.
- Metricas agregadas por proceso sin etiquetas de usuarios, rutas ni organizaciones.
- Endpoint desactivado por defecto y protegido por clave independiente del operador.
- Errores internos sin volcado de excepciones y errores JSON sin reflejar contenido recibido.
- Rotacion de logs prevista en Compose, pendiente de validacion con Docker.
- Guia operativa, manual Word e informe semanal actualizados.

## Evidencia

42 pruebas aprobadas, incluidas ocho nuevas de observabilidad; compilacion estatica y comprobacion de diferencias. Las pruebas usan bases desechables y secretos ficticios. No se modifico `.env` ni se activo el acceso a metricas en la instalacion del usuario. No hubo cambios visuales, nuevas dependencias ni contratacion de servicios.

## Pendiente

La observabilidad es basica: faltan colector, historicos, trazas, alertas y pruebas de carga. PostgreSQL, cola compartida, despliegue productivo y conectores con cuentas reales siguen pendientes. GitHub Pages continua como demostracion estatica sin estos endpoints.
