# Copias cifradas y restauracion

## Alcance

Disponible desde v0.5.1 para instalaciones SQLite de una sola instancia. La copia usa la API de backup online de SQLite, incluye las escrituras confirmadas en WAL y no requiere detener el servidor. No copia directamente el archivo de una base en uso.

Cada ejecucion crea una carpeta nueva con `database.enc` y `manifest.json`. AES-256-GCM cifra la base completa y autentica los metadatos de version, fecha y migraciones. SHA-256 permite comprobar el archivo cifrado. La copia se descifra y se comprueba antes de declararse exitosa: integridad SQLite, referencias y esquema compatible.

No hay endpoints web de descarga o restauracion. Son operaciones del administrador del servidor, no de un administrador de una organizacion: una copia contiene **todas las organizaciones**.

## Preparacion

Generar una clave independiente en una terminal privada:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guardar ese valor como `BACKUP_ENCRYPTION_KEY` en el gestor de secretos o `.env` privado. Nunca enviarlo al chat, documentarlo con su valor real ni subirlo a GitHub. Conservar una copia protegida de esa clave fuera del servidor. Tambien se necesita el `TOKEN_ENCRYPTION_KEY` original para descifrar OAuth y MFA tras recuperar la base. No son intercambiables.

## Operacion manual

```bash
npm run db:backup
npm run db:verify -- "backups/CARPETA-DE-LA-COPIA"
npm run db:restore -- "backups/CARPETA-DE-LA-COPIA" "data/recuperada.sqlite"
```

Reemplazar `CARPETA-DE-LA-COPIA` por la carpeta devuelta al crear el respaldo. `db:backup` usa `DATABASE_PATH` y permite una carpeta de salida opcional. Verificar no modifica la base activa. Restaurar exige un archivo nuevo y rechaza destinos existentes o con archivos auxiliares SQLite; no hay opcion de sobrescritura.

Una clave incorrecta, archivo alterado, copia incompleta, esquema no compatible o referencias invalidas detienen la operacion. Solo usar copias propias y verificadas; no importar bases de terceros no confiables.

## Copias periodicas

Configurar y reiniciar el servidor:

```dotenv
BACKUP_DIRECTORY=backups
BACKUP_INTERVAL_HOURS=24
```

El valor predeterminado es `0` (desactivado). Se admiten intervalos de 1 a 168 horas. Al activarlo se crea una copia al arrancar y otra por intervalo mientras el proceso siga encendido. No se ejecutan dos copias simultaneas dentro del mismo trabajador. El apagado espera la copia activa antes de cerrar SQLite. Una configuracion invalida impide iniciar el servidor.

Se emiten eventos JSON `backup.completed` o `backup.failed` en la salida del servidor, sin claves ni datos de usuarios. No existe todavia un servicio externo de alertas o retencion. Los archivos no se borran automaticamente; controlar el espacio y definir una retencion operativa.

Compose incorpora un volumen separado para `/app/backups`. Sigue estando en el mismo host: no protege frente a la perdida completa del equipo. Se debe transferir el paquete cifrado completo a un almacenamiento independiente y proteger las claves por separado.

## Recuperacion controlada

1. Verificar la copia, su fecha y la disponibilidad de ambas claves.
2. Restaurar a una ruta nueva. La base de origen no se modifica.
3. Detener la aplicacion antes del cambio de base y conservar la base anterior.
4. Cambiar `DATABASE_PATH` a la ruta recuperada y mantener la clave OAuth/MFA original.
5. Arrancar una sola instancia y comprobar `/api/v1/health/ready`.
6. Iniciar sesion, revisar organizaciones, roles, reportes y cuentas; comprobar cambios de contrasena o revocaciones posteriores a la copia.
7. Regenerar los codigos de recuperacion 2FA desde Cuenta y reactivar solo las sincronizaciones revisadas desde Integraciones.

La restauracion elimina sesiones, enlaces de verificacion/recuperacion, desafios MFA y estados OAuth pendientes. Elimina codigos de recuperacion antiguos para no reactivar uno consumido despues de la copia; mantiene TOTP activo. Pausa programaciones, libera arrendamientos y marca sincronizaciones interrumpidas. Conserva datos, contrasenas, roles y configuracion del momento del respaldo; **no reproduce cambios posteriores**. Una perdida simultanea del autenticador y sus codigos necesita un procedimiento de recuperacion administrado, todavia pendiente.

## Proteccion de archivos y limites

- Las carpetas temporales son privadas y los archivos se crean con permisos restrictivos en sistemas POSIX. En Windows revisar las ACL y el cifrado del disco.
- La instantanea temporal se descifra solo en una carpeta privada y se elimina al terminar o ante errores controlados. Una terminacion forzada del proceso/equipo puede dejar temporales; revisar `.snapshot-*` y `.restore-*` antes de liberar acceso al disco. El borrado no equivale a borrado seguro de sectores.
- Las copias no incluyen `.env`, codigo, infraestructura ni el valor de las claves. Guardar esos elementos mediante procedimientos independientes.
- No hay retencion automatica, copia externa, monitoreo centralizado ni recuperacion de PostgreSQL.
- La validacion automatizada usa datos desechables y no reemplaza simulacros en produccion ni una auditoria de seguridad.

## Evidencia

`test/backups.test.js` comprueba el recorrido completo, WAL, cifrado, integridad, claves erroneas, manipulacion, no sobrescritura, limpieza temporal, aislamiento de la base origen, comandos CLI y planificacion sin solapamiento. GitHub Actions ejecuta estas pruebas antes de publicar la demo.
