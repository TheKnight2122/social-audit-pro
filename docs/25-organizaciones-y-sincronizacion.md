# Organizaciones y sincronizacion

## Organizaciones

Cada usuario pertenece a una o mas organizaciones mediante `organization_members`. La sesion conserva `organization_id` y el middleware valida que la membresia siga activa. Un administrador puede crear otra organizacion y cambiar el contexto desde la interfaz.

Las rutas de analitica, reportes, actividad, usuarios e integraciones filtran por la organizacion activa. Las conexiones OAuth y programaciones tambien incluyen ese identificador.

## Sincronizacion automatica

Cada conexion oficial crea una fila en `sync_schedules`. El usuario puede habilitarla y elegir un intervalo de 15 minutos a 7 dias.

`src/server/sync-worker.js` ejecuta este proceso:

1. Busca una tarea vencida y habilitada.
2. La reclama atomicamente con `lease_owner` y `lease_expires_at`.
3. Descifra tokens y consulta el adaptador con limite de espera de 120 segundos; renueva el bloqueo mientras espera.
4. Revalida bloqueo, organizacion, cuenta y, en ejecuciones manuales, sesion y permisos; persiste en la misma transaccion.
5. Calcula la siguiente ejecucion y libera el arrendamiento.
6. Ante error, registra el fallo y programa un reintento controlado.

La ruta manual y el trabajador comparten `sync-service.js`. Cada reclamo tiene un propietario aleatorio independiente; no se escribe con un bloqueo vencido ni se libera el de otro propietario. Una ejecucion manual simultanea devuelve 409. Pausar una programacion impide persistir el resultado programado en curso, pero permite futuras ejecuciones manuales.

El timeout descarta resultados tardios; un SDK que ignore cancelacion puede continuar la consulta externa, sin permiso para guardar su resultado. No es garantia de una sola llamada al proveedor ni una cola distribuida. SQLite sigue limitado a una instancia.

## Variables

- `SYNC_WORKER_ENABLED`: activa o desactiva el trabajador.
- `SYNC_WORKER_POLL_MS`: frecuencia con la que busca trabajo.
- `SYNC_INTERVAL_MINUTES`: intervalo inicial de nuevas conexiones.

## Pruebas

`sync-worker.test.js`, `sync-safety.test.js` y `tenant-security.test.js` prueban trabajadores, conexiones SQLite independientes, concurrencia HTTP, permisos retirados, revocacion, timeout y aislamiento. Ver `31-validacion-concurrencia-y-carga.md`.
