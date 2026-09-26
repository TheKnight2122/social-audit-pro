# Organizaciones y sincronizacion

## Organizaciones

Cada usuario pertenece a una o mas organizaciones mediante `organization_members`. La sesion conserva `organization_id` y el middleware valida que la membresia siga activa. Un administrador puede crear otra organizacion y cambiar el contexto desde la interfaz.

Las rutas de analitica, reportes, actividad, usuarios e integraciones filtran por la organizacion activa. Las conexiones OAuth y programaciones tambien incluyen ese identificador.

## Sincronizacion automatica

Cada conexion oficial crea una fila en `sync_schedules`. El usuario puede habilitarla y elegir un intervalo de 15 minutos a 7 dias.

`src/server/sync-worker.js` ejecuta este proceso:

1. Busca una tarea vencida y habilitada.
2. La reclama atomicamente con `lease_owner` y `lease_expires_at`.
3. Descifra tokens y consulta el adaptador del proveedor.
4. Normaliza y persiste datos sin duplicarlos.
5. Calcula la siguiente ejecucion y libera el arrendamiento.
6. Ante error, registra el fallo y programa un reintento controlado.

El arrendamiento evita que dos trabajadores procesen la misma fila al mismo tiempo si comparten una base transaccional. La edicion SQLite sigue limitada a una instancia.

## Variables

- `SYNC_WORKER_ENABLED`: activa o desactiva el trabajador.
- `SYNC_WORKER_POLL_MS`: frecuencia con la que busca trabajo.
- `SYNC_INTERVAL_MINUTES`: intervalo inicial de nuevas conexiones.

## Pruebas

`test/sync-worker.test.js` crea dos trabajadores y verifica que una tarea se ejecute una sola vez. `test/api.test.js` confirma el aislamiento entre dos organizaciones.
