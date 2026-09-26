# Base de datos

## Estado

Persistencia SQLite implementada con `better-sqlite3`, claves foraneas y WAL. Las migraciones `001` a `006` se aplican y registran en orden al abrir la base.

## Entidades principales

- Identidad: `users`, `roles`, `sessions`, `login_attempts`, `auth_tokens` y `email_outbox`.
- Organizaciones: `organizations` y `organization_members`.
- Plataformas: `social_platforms`, `integrations` y `organization_integrations`.
- OAuth: `oauth_states`, `oauth_connections` y `oauth_sync_runs`.
- Sincronizacion: `sync_schedules` y `sync_runs`.
- Analitica: `social_accounts`, `posts` y `metric_snapshots`.
- Operacion: `reports` y `activity_logs`.

## Reglas de aislamiento

Las sesiones conservan una organizacion activa. Las consultas de cuentas, historicos, publicaciones, reportes, integraciones y actividad exigen ese identificador. Las membresias determinan que organizaciones puede seleccionar cada usuario.

## Cifrado y hashes

- Contrasenas, tokens de sesion, tokens de cuenta y codigos de recuperacion se almacenan como hashes cuando no necesitan recuperarse.
- Tokens OAuth, secretos TOTP, secretos de integracion y verificadores PKCE se cifran porque deben volver a utilizarse.
- El frontend nunca recibe los valores cifrados ni los secretos originales.

## Restricciones

- Unicidad de correo y membresia.
- Unicidad de cuentas externas y puntos historicos.
- Escrituras idempotentes para evitar duplicados durante sincronizaciones.
- Arrendamientos con propietario y vencimiento para reclamar tareas programadas.
- Borrado relacionado mediante claves foraneas cuando corresponde.

## Limite actual

SQLite es la base de la edicion local y de una unica instancia. No debe compartirse su archivo entre varios servidores. La siguiente fase de produccion debe portar las consultas y migraciones a PostgreSQL o equivalente administrado.
