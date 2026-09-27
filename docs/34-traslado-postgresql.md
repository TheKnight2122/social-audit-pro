# Traslado controlado a PostgreSQL

## Estado

Continuacion v0.5.7: ya se adaptaron lectura de sesiones y limite de acceso, con pool PostgreSQL; las demas operaciones siguen pendientes. Ver `docs/35-acceso-asincrono-postgresql.md`. Este documento conserva el alcance del traslado de v0.5.6.

v0.5.6 incorpora el esquema PostgreSQL y una herramienta de traslado verificado. **No cambia el backend activo:** `npm start` sigue usando SQLite. No configurar `DATABASE_URL` esperando que cambie el motor. Falta portar consultas, transacciones, autenticacion, sincronizacion y copias antes de poner la API sobre PostgreSQL.

No se ha trasladado la base real ni contratado un proveedor. Las pruebas usan datos desechables. GitHub Pages sigue siendo una demostracion estatica.

## Que incluye

- `migrations/postgresql/001-baseline.sql`: 21 tablas de aplicacion y un registro de migraciones propio.
- `src/server/postgres-transfer.js`: validacion, instantanea privada en memoria, preparacion de seguridad, importacion transaccional y verificacion de filas.
- `scripts/database-postgres.js`: CLI explicita, sin activacion automatica ni rutas HTTP.
- `test/postgres-transfer.test.js`: ocho pruebas con PostgreSQL embebido (PGlite), SQLite real y CLI.
- `scripts/postgres-smoke.js`: prueba de traslado, rollback y bloqueo entre conexiones con PostgreSQL servidor. El workflow usa un servicio PostgreSQL 16 desechable en CI.

Se conservan identificadores, contrasenas derivadas, secretos cifrados, empresas, membresias, cuentas, publicaciones, metricas, reportes e historicos. Las secuencias respetan incluso los identificadores eliminados. Las fechas y JSON permanecen como texto para preservar su representacion original; el futuro adaptador debe normalizar la comparacion temporal y no depender de comparaciones entre formatos distintos.

Los indices de correo y slug usan `lower(... COLLATE "C")` para conservar la unicidad ASCII sin distincion de mayusculas. Las futuras consultas de login deben usar la misma normalizacion; una comparacion PostgreSQL `email = $1` por si sola no equivale al `NOCASE` de SQLite.

## Antes de usarlo

1. Usar primero una copia de prueba sin informacion de clientes y un destino PostgreSQL nuevo y exclusivo.
2. Para un futuro traslado real, detener escrituras y trabajadores durante todo el corte. Una instantanea es coherente pero no incorpora cambios posteriores; no hay replicacion continua ni fusion de bases.
3. Crear y verificar una copia cifrada con `npm run db:backup`. Custodiar aparte la clave de copia y el `TOKEN_ENCRYPTION_KEY` original; la herramienta no descifra ni comprueba que se haya conservado esa clave.
4. Configurar `MIGRATION_DATABASE_URL` de forma privada, con un usuario dedicado propietario del destino. El usuario de ejecucion futura debe ser distinto y con permisos limitados. No poner URLs con contrasenas en comandos, documentos o Git.
5. El destino debe carecer de tablas, vistas, secuencias y del esquema `social_audit`. La herramienta no mezcla, borra ni sobrescribe destinos existentes.

## Comprobacion sin red

```bash
npm run db:postgres -- check "RUTA_A_COPIA_SQLITE"
```

Abre el origen en modo lectura. Valida esquema exacto, migraciones, integridad, referencias, asociaciones de empresas y valores compatibles. Prepara otra base solo en memoria y muestra cantidades y medidas de seguridad, nunca filas, tokens o credenciales. No conecta a PostgreSQL, aunque exista una URL configurada.

El limite de la instantanea es 256 MiB; el consumo total de memoria es mayor. Se rechazan enteros o secuencias fuera del rango PostgreSQL INTEGER, textos con bytes nulos y bases modificadas fuera de las migraciones conocidas. Las referencias inconsistentes deben revisarse en origen; no se reparan silenciosamente.

## Aplicacion explicita

```bash
npm run db:postgres -- apply "RUTA_A_COPIA_SQLITE" --confirm-empty-target
```

La URL privada usa `postgresql://USUARIO:CLAVE@HOST:5432/BASE`, sin parametros adicionales. Se exige TLS con validacion de certificado. No se admite `sslmode=no-verify` ni desactivar validacion para un host remoto. Solo una prueba en loopback puede usar `MIGRATION_ALLOW_LOCAL_PLAINTEXT=true`. Un proveedor que requiera una CA privada necesita configurar confianza apropiada antes de usar esta herramienta, no omitir la validacion.

La CLI conecta un unico cliente, toma un bloqueo transaccional, comprueba el destino, crea `social_audit`, inserta por lotes de 100, compara cantidades y huellas SHA-256 por tabla, ajusta secuencias y confirma. Las claves foraneas de cuentas OAuth y horarios incluyen la organizacion para impedir asociaciones cruzadas. No se copian los nombres de migraciones SQLite al historial PostgreSQL.

Ante un fallo anterior al commit se solicita rollback. Si se corta la conexion durante la confirmacion, el resultado puede ser incierto: revisar el esquema y cantidades en destino antes de reintentar. No borrar nada automaticamente. Un nuevo intento rechaza un destino ocupado.

## Medidas en el destino

- No se trasladan sesiones, estados OAuth ni tokens de recuperacion, verificacion o login MFA.
- Se eliminan secretos MFA pendientes y codigos de recuperacion antiguos; se conserva el MFA ya habilitado. Debe comprobarse acceso al autenticador y planificar regenerar codigos antes de abrir el servicio.
- Los horarios quedan pausados y sin propietarios de bloqueo.
- Ejecuciones que estaban en curso quedan fallidas y los correos pendientes quedan detenidos. No se envian correos ni se consulta ninguna red.
- Se agrega un evento de traslado al registro de actividad.

Estos cambios ocurren solo en la instantanea y el destino. La base local original y sus sesiones se conservan. Los datos personales siguen siendo privados aunque los secretos esten cifrados: proteger acceso al destino, disco y memoria del proceso. La instantanea no se escribe como un archivo temporal sin cifrar.

## Validacion y siguientes pasos

`npm test` ejecuta 84 pruebas, incluidas las ocho nuevas. `npm run build` genera la misma demo. `npm run test:load -- 200 8` verifica el servidor SQLite con 200 solicitudes y ocho concurrentes, no la capacidad productiva de PostgreSQL.

PGlite ejecuta PostgreSQL en WASM; no sustituye pruebas del protocolo, TLS, multiples procesos o un proveedor remoto. El workflow agrega `npm run test:postgres` contra PostgreSQL 16 por TCP en loopback, con una base nueva y datos de prueba. Sus credenciales de fixture publicadas no son credenciales del usuario ni de produccion.

Siguiente trabajo: portar la capa de acceso asincrona y SQL del backend, conservar atomicidad de permisos/leases y probar los flujos completos en ambos motores. Despues desplegar API, registrar secretos autorizados y probar Microsoft 365 y redes oficiales. Este traslado no implementa alta disponibilidad ni almacenamiento externo de copias.

## Referencias

- [node-postgres y TLS](https://node-postgres.com/features/ssl): configuracion del cliente y advertencia sobre parametros SSL de la URL.
- [PostgreSQL 16 CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html): identidades y restricciones del esquema.
- [PGlite](https://pglite.dev/docs/about): motor PostgreSQL embebido para pruebas locales.
- [SQLite deserialize](https://www.sqlite.org/c3ref/deserialize.html): ajuste del modo WAL exclusivamente en la cabecera de la instantanea en memoria.
