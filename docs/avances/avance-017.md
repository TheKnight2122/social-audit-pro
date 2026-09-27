# Avance 017

Fecha: 2026-09-26. Version: v0.5.6.

## Solicitud

Continuar los pendientes de produccion sin contratar servicios ni activar APIs de pago.

## Resultado

Esquema PostgreSQL independiente y herramienta de traslado explicito desde una instantanea SQLite. Comprueba integridad, relaciones, correspondencia de datos y secuencias; rechaza destinos ocupados. No modifica SQLite ni conecta automaticamente el backend al nuevo motor.

Sesiones y enlaces quedan invalidados en la copia, MFA pendiente y codigos de recuperacion se reinician, tareas y correos pendientes se pausan. Se conservan contrasenas derivadas, MFA activo, cifrados e historicos. Claves originales deben custodiarse por separado.

## Evidencia

- Ocho pruebas nuevas: importacion, estructura completa, cifrados, aislamiento, secuencias, rollback, destino ocupado, bloqueo, validacion de origen, WAL, varios lotes, CLI privada y configuracion TLS.
- 84 pruebas totales aprobadas; build correcto.
- Carga SQLite local: 200 solicitudes, concurrencia ocho, cero errores, 20 reportes persistidos.
- Prueba PostgreSQL 16 por TCP incorporada al workflow; comprueba dos conexiones, rollback y destino ocupado con fixtures.
- Manual e informe de la semana del 21 al 27 actualizados. No hubo cambios visuales ni eliminacion de funciones.

## Pendiente

Portar el backend asincrono completo a PostgreSQL, desplegarlo, autorizar el correo, validar redes reales y completar infraestructura de alta disponibilidad. No se trasladaron datos reales ni se contrataron servicios. Ver `docs/34-traslado-postgresql.md`.
