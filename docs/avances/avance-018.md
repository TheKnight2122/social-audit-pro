# Avance 018

Fecha: 2026-09-26. Version: v0.5.7.

## Solicitud

Continuar la adaptacion del backend a PostgreSQL sin perder funciones locales ni contratar servicios.

## Implementacion

Contrato asincrono de lectura de sesiones y limite de intentos, con adaptadores SQLite y PostgreSQL. El middleware deja de acceder directamente a SQLite. Se conservan identidad, empresa, permisos y CSRF; se corrige la comparacion de expiracion en formatos diferentes.

Pool PostgreSQL acotado, TLS verificado, UTC y esquema calificado. Transacciones en un solo cliente con READ COMMITTED, rollback, liberacion y descarte ante resultados ambiguos. El limite compartido usa un bloqueo transaccional por clave.

El arranque completo permanece en SQLite; no hay mezcla entre motores ni migracion de datos reales. No se cambio el diseno ni se eliminaron funciones.

## Verificacion

- 96 pruebas aprobadas; doce nuevas para los adaptadores, middleware y pool.
- Build correcto y carga local de 200 solicitudes, ocho concurrentes, cero errores.
- Prueba PostgreSQL 16 de CI ampliada con dos pools, 30 intentos concurrentes, roles vigentes y expiracion.
- Manual e informe semanal actualizados con alcance y pendientes.

## Pendiente

Portar las restantes operaciones de autenticacion, organizaciones, analitica, reportes y sincronizacion. Despues habilitar el motor PostgreSQL en el arranque y desplegar. No se activaron correo o redes reales. Ver `docs/35-acceso-asincrono-postgresql.md`.
