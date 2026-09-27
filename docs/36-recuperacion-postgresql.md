# Recuperacion de cuenta en dos motores

## Alcance de v0.5.8

La recuperacion de contrasena y verificacion de correo utilizan el mismo controlador HTTP con adaptadores SQLite y PostgreSQL. El registro de entrega del correo tambien esta separado del motor. **El backend completo todavia arranca en SQLite.** No se activo PostgreSQL para la aplicacion, no se migraron datos reales ni se envio correo empresarial real.

## Componentes

- `src/server/routes/recovery.js`: solicitud/confirmacion de verificacion y solicitud/restablecimiento de contrasena. Conserva rutas y respuestas existentes bajo `/api/v1/auth`.
- `src/server/recovery-store.js`: consultas de usuario, enlaces, confirmacion, reset y actividad. Las consultas PostgreSQL califican `social_audit` y requieren UTC, como el pool del proyecto.
- `src/server/account-security.js`: genera tokens aleatorios de 32 bytes y guarda solo SHA-256. Sus operaciones de enlaces ahora se esperan con `await`.
- `src/server/email-store.js`: outbox SQLite/PostgreSQL. `email.js` espera persistencia y transportes sin mantener transacciones abiertas durante el envio.
- `routes/auth.js`: sigue construyendo expresamente el adaptador SQLite de su propia base; registro, login y gestion MFA no se han portado completos.

## Enlaces y transacciones

Cada emision invalida el enlace anterior del mismo usuario y proposito dentro de la misma transaccion. Los propositos son verificacion, recuperacion y desafio MFA; no son intercambiables. SQLite usa transacciones inmediatas sin callbacks asincronos. PostgreSQL bloquea la fila del usuario y vuelve a consultar el enlace despues de adquirir el bloqueo, con READ COMMITTED. Operaciones concurrentes comparten ese orden de bloqueo.

El reset cambia la contrasena, invalida enlaces de recuperacion y desafios MFA, elimina todas las sesiones del usuario y limpia el alta MFA pendiente. **No desactiva MFA ya configurado.** Un fallo revierte la transaccion completa. La verificacion confirma el correo y consume sus enlaces. Solo usuarios activos pueden emitir o consumir enlaces. El contexto empresarial del enlace se usa para auditoria, no para conceder membresias o permisos.

Las fechas se comparan como fechas, aceptando formato SQL UTC e ISO con zona, no alfabeticamente. La ruta de reset revisa el enlace antes del calculo de contrasena y lo vuelve a comprobar en la transaccion posterior. Solo una solicitud concurrente puede completarlo. Las futuras rutas PostgreSQL de login y MFA deberan respetar el mismo bloqueo y revalidar credenciales al emitir sesiones; no estan habilitadas aun.

## Correo y privacidad

En produccion, solicitar recuperacion conserva la misma respuesta para un correo existente o inexistente y no devuelve enlaces. Las previsualizaciones se limitan a pruebas y desarrollo con configuracion explicita. Esto no garantiza igualdad de tiempos de respuesta ni sustituye controles contra abuso.

Outbox guarda destinatario, asunto y estado, nunca texto, HTML, contrasena o enlace. Sin transporte permanece pendiente. Un rechazo del proveedor guarda un mensaje fijo, no el error original. Si el proveedor acepta y luego falla la escritura del estado, se propaga el fallo de base sin marcar falsamente un fallo del proveedor ni reintentar el envio. El estado puede quedar pendiente y requiere revision; **outbox no es una cola de reenvio de mensajes**. Aceptacion del transporte no acredita llegada al buzon.

Microsoft 365 y SMTP conservan sus transportes anteriores. Siguen pendientes autorizacion empresarial y prueba de entrega real. No se guardaron credenciales nuevas ni se activo ningun servicio de pago.

## Verificacion

- `npm test`: 105 pruebas. Nueve nuevas cubren contratos HTTP en SQLite/PostgreSQL embebido, aislamiento entre usuarios, CSRF, caducidad, reemplazo, consumo unico, rollback y privacidad de errores/correo.
- `npm run test:load -- 200 8`: 200 solicitudes, ocho concurrentes, cero errores y 20 reportes guardados en una base local desechable.
- `npm run build`: demo estatica generada sin cambios de interfaz.
- `npm run test:postgres`: CI con PostgreSQL 16 desechable. Repite los contratos HTTP y prueba 12 emisiones y 12 resets concurrentes entre dos pools. Solo queda un enlace vigente y solo un reset se completa.

PGlite serializa su unica conexion; la prueba de servidor es la que verifica bloqueos entre conexiones reales. Los correos de todas estas pruebas usan transportes capturados o fallos controlados, no cuentas empresariales reales. Las sesiones de los contratos PostgreSQL son fixtures; no equivalen a un login PostgreSQL completo.

## Pendientes

Portar registro, emision/cierre de sesiones y gestion MFA; despues organizaciones, analitica, integraciones, reportes y trabajadores. Solo entonces habilitar un unico motor para toda la aplicacion y preparar el traslado/despliegue autorizado. La publica sigue siendo una demo estatica y la local conserva sus funciones SQLite. Credenciales sociales, aprobaciones, correo real, despliegue y alta disponibilidad siguen pendientes.
