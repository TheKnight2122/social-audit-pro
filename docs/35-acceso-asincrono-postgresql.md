# Sesiones y limite de acceso en dos motores

## Estado de v0.5.7

La lectura de sesiones y el limite de intentos ya usan un contrato asincrono independiente del motor. Hay adaptadores SQLite y PostgreSQL probados con el mismo middleware de identidad, permisos y CSRF. **La aplicacion completa sigue arrancando con SQLite.** No existe aun un interruptor para ejecutar todo el backend sobre PostgreSQL.

No se trasladaron datos reales, no se activaron servicios externos y no se contrataron planes. La demo publica conserva el mismo aspecto y no ejecuta autenticacion real.

## Cambios

- `src/server/access-store.js` implementa `loadSession(tokenHash)` y `consumeLoginAttempt(key, options)` en ambos motores. Todas las operaciones se esperan mediante `await`.
- `src/server/middleware.js` recibe el repositorio de acceso y deja de consultar SQLite directamente. La empresa, membresia y rol se leen del servidor en cada carga, no de identificadores enviados por el navegador.
- `src/server/login-limiter.js` conserva HTTP 429 y `Retry-After`. Un fallo de base no autoriza el intento.
- `src/server/app.js` construye expresamente el adaptador SQLite de su misma base. No mezcla sesiones PostgreSQL con usuarios o datos SQLite.
- `src/server/postgres-config.js` centraliza la configuracion TLS compartida con la herramienta de traslado.
- `src/server/postgres-pool.js` prepara conexiones y transacciones para los siguientes modulos.

## Sesiones

La consulta exige que usuario, membresia y empresa esten activos y que la sesion no haya vencido. Una sesion que apunta a una empresa donde el usuario no es miembro no se acepta. El estado de usuario se actualiza en memoria solo despues de terminar la consulta; Express 5 recibe los errores asincronos.

Se conserva el token CSRF de la sesion y no se devuelven contrasenas derivadas, secretos MFA ni credenciales sociales. Solo las sesiones validas actualizan su ultima actividad. Las fechas SQL UTC, ISO con Z y con desplazamiento horario se interpretan como fechas, no se comparan alfabeticamente. Esto corrige en SQLite la aceptacion posible de una fecha ISO vencida en el mismo dia.

El pool PostgreSQL fija UTC al conectar. El adaptador requiere ese contexto para fechas antiguas almacenadas sin zona horaria. Las pruebas embebidas reproducen la misma configuracion y prueban fechas vencidas y vigentes.

## Intentos concurrentes

SQLite agrupa limpieza, conteo e insercion en una transaccion inmediata y sin esperas asincronas internas. PostgreSQL limpia registros vencidos fuera de la transaccion por clave y luego usa un bloqueo asesor transaccional, conteo e insercion en el mismo cliente. El aislamiento se fija en READ COMMITTED para leer los intentos confirmados despues de obtener el bloqueo.

La prueba de servidor envia 30 intentos simultaneos desde dos pools: solo cinco deben aceptarse para la misma clave dentro de la ventana. Otra clave conserva su propio limite. No se agrega un registro por cada solicitud bloqueada. Todos los servidores futuros deberan usar la misma configuracion de ventana y maximo.

Esto protege el acceso de la aplicacion; no es una proteccion DDoS ni sustituye controles del proxy, capacidad y monitoreo productivos. La limpieza en cada intento es apropiada para el piloto; requiere medir rendimiento y retencion al crecer.

## Pool y transacciones

El pool usa cinco conexiones por defecto, configurables entre una y veinte por proceso, espera de conexion de diez segundos, limite de consulta del servidor de diez segundos y de bloqueo de tres segundos. El cliente limita esperas de consulta a quince segundos. Una conexion inactiva en una transaccion tambien tiene limite de quince segundos; no ejecutar llamadas a redes sociales ni correo dentro de estas transacciones.

Las consultas califican `social_audit` y el pool usa `search_path=pg_catalog`. TLS verifica certificados; la excepcion sin TLS solo admite loopback y un valor booleano explicito. El error de una conexion ociosa puede registrar un evento fijo sin mensaje, URL, parametros ni filas del proveedor.

`withPostgresTransaction` reserva un cliente hasta commit o rollback y siempre lo libera. Descarta conexiones con rollback fallido o confirmacion ambigua. No reintenta escrituras automaticamente: una respuesta perdida de COMMIT no prueba que la operacion no se haya aplicado. [Transacciones node-postgres](https://node-postgres.com/features/transactions), [pools](https://node-postgres.com/apis/pool), [bloqueos PostgreSQL](https://www.postgresql.org/docs/16/functions-admin.html).

## Evidencia

- `npm test`: 96 pruebas, doce nuevas sobre ambos motores, expiracion, aislamiento, permisos, CSRF, concurrencia, manejo de errores y liberacion de clientes.
- `npm run test:load -- 200 8`: 200 solicitudes al backend SQLite desechable, ocho concurrentes, cero errores y 20 reportes persistidos.
- `npm run build`: demo estatica generada sin modificaciones visuales.
- `npm run test:postgres`: prueba ampliada en CI con PostgreSQL 16, dos pools, sesiones y limite compartido. Requiere una base desechable vacia en loopback; no usar datos reales.

PGlite solo tiene una conexion: su adaptador en `scripts/lib/pglite-pool.js` serializa los accesos de prueba, no representa multiples servidores. La prueba con el servidor PostgreSQL es la que ejercita conexiones concurrentes reales. Ninguna de estas pruebas acredita alta disponibilidad o seguridad productiva completa.

## Lo que sigue

Portar registro, emision/cierre de sesiones, verificacion de correo, recuperacion y MFA; despues organizaciones, analitica, reportes, integraciones y trabajadores, conservando sus transacciones y controles. Estas funciones ya existen y siguen funcionando en SQLite. Las pruebas PostgreSQL de esta entrega crean sesiones de fixture; **no equivalen a un login completo del producto sobre PostgreSQL**.

Una vez portados todos los modulos se podra habilitar la seleccion del motor, ejecutar el traslado autorizado, desplegar el piloto y validar cuentas oficiales. Siguen pendientes autorizacion Microsoft 365, credenciales sociales y la infraestructura de alta disponibilidad. X sigue desactivado por presupuesto.
