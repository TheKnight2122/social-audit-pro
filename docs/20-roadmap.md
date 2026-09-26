# Roadmap

## Fases completadas

- Preparacion, requisitos, diseno y arquitectura inicial.
- Frontend modular con once vistas.
- Backend, API, persistencia local y PDF.
- Autenticacion, roles, CSRF y cifrado.
- YouTube oficial de extremo a extremo.
- Organizaciones, seguridad de cuenta y sincronizacion automatica.
- Adaptadores multired y pruebas simuladas de normalizacion.
- Publicacion estatica automatica y documentacion visual.

## Fase actual - Activacion controlada

1. Registrar aplicaciones de Meta, TikTok, LinkedIn y X.
2. Solicitar los productos, permisos y revisiones necesarios.
3. Cargar credenciales mediante variables del servidor.
4. Validar autorizacion, sincronizacion, renovacion y revocacion con cuentas de prueba.
5. Confirmar que cada metrica se obtiene oficialmente y documentar ausencias.

## Siguiente fase - Produccion

1. Elegir host, PostgreSQL administrado, SMTP y gestor de secretos.
2. Portar persistencia y migraciones desde SQLite.
3. Automatizar despliegues, copias y restauraciones.
4. Separar API y trabajador con una cola compartida.
5. Incorporar logs estructurados, metricas, trazas y alertas.
6. Ejecutar pruebas de carga y seguridad.

## Alta disponibilidad

Estado: preparada parcialmente, no completada.

- Completado: sesiones persistentes, limitador persistente, tareas con arrendamiento, endpoints de vida/disponibilidad y apagado ordenado.
- Pendiente: base compartida, cola compartida, balanceador, multiples replicas, almacenamiento externo, observabilidad y recuperacion ante desastres.

## Criterio para version estable

La primera version estable requiere al menos un entorno productivo reproducible, conectores activados y validados, aislamiento revisado, restauracion probada y pruebas de seguridad sin hallazgos criticos.
