# Validacion de concurrencia y carga

## Correcciones de v0.5.3

La sincronizacion manual y programada comparten un servicio de ejecucion. El reclamo usa una transaccion SQLite inmediata y un identificador aleatorio por tarea. Durante la consulta, renueva el arrendamiento; al guardar comprueba que sigue vigente, que la conexion no fue revocada, que la organizacion esta activa y que el proveedor devolvio la misma cuenta.

En ejecuciones manuales tambien revalida la sesion y los permisos actuales. Pausar una tarea programada impide que guarde resultados en curso. La escritura de datos, la actividad y el avance de la programacion forman una transaccion. Una segunda ejecucion manual devuelve 409 mientras haya un bloqueo vigente.

OAuth consume cada estado en una transaccion y revalida permisos tras consultar al proveedor. Una reconexion no sobrescribe una cuenta que se esta sincronizando. El dashboard exige que la organizacion de la cuenta coincida con la conexion; la fecha de ultima sincronizacion ya no se toma de metadatos globales de otra empresa.

## Limites de ejecucion

El limite de espera de sincronizacion es 120 segundos y los errores normales reintentan a los 30 minutos. El timeout descarta la respuesta tardia y libera solamente el bloqueo propio. La cancelacion de red depende del adaptador o SDK: si ignora la senal puede terminar su consulta externamente, sin escribir en SQLite. Esto no garantiza una sola llamada externa ni evita todos los efectos de una renovacion de tokens del proveedor.

La aplicacion continua con SQLite de una instancia. No hay PostgreSQL, cola externa, replicas ni garantia de alta disponibilidad. El esquema historico de integraciones sigue teniendo una plataforma global; las consultas visibles filtran por organizacion y se rechaza reasignar una cuenta ajena. La futura migracion debe revisar ese esquema, no copiarlo sin cambios.

## Pruebas automatizadas

Se agregan 16 pruebas, hasta un total de 58: conexiones SQLite independientes, propietarios vencidos, renovacion, revocacion/desactivacion, cambio de permisos, cierre de sesion, pausa, timeout, errores sin secretos, cuenta inesperada, apagado y aislamiento HTTP de recursos. Las pruebas de callback verifican permisos retirados, repeticion del estado y rechazo de reconexion mientras existe bloqueo.

Son pruebas locales con datos ficticios. No sustituyen auditoria externa, penetracion ni validacion con redes reales.

## Carga reproducible

```bash
npm run test:load -- 500 10
```

El comando crea una base SQLite temporal propia y un servidor en un puerto libre ligado a `127.0.0.1`. No acepta una URL de destino, no carga `.env`, no llama a redes sociales y no modifica la base local del usuario. Usa una sesion ficticia ya creada: no mide el coste de login, scrypt, SMTP ni OAuth.

Ejecuta 90 por ciento de consultas autenticadas a dashboard, cuentas, publicaciones, historicos y reportes, y 10 por ciento de creaciones de reporte. Consume cada respuesta, verifica los estados HTTP esperados y el numero de reportes guardados. Cierra servidor y base, y elimina solo su carpeta temporal. Rechaza mas de 5000 solicitudes o mas de 32 concurrentes. Un cuarto argumento opcional guarda JSON en un archivo nuevo, sin sobrescribirlo.

La evidencia `docs/evidencias/carga-v053.json` registra 500 solicitudes, concurrencia 10, cero fallos, 450 respuestas 200 y 50 respuestas 201; los 50 reportes quedaron persistidos. Los tiempos describen una prueba corta en esta maquina, con un conjunto diminuto de datos. No son un SLA ni una estimacion de usuarios simultaneos soportados.

GitHub Actions ejecuta una prueba corta de 200 solicitudes con concurrencia 8 antes de publicar. No se usan umbrales de milisegundos dependientes del hardware para bloquear CI; se exige ausencia de fallos y consistencia de escrituras.

## Pendientes para completar la solicitud general

- Aplicaciones aprobadas, credenciales privadas y pruebas reales de cada red, incluida revocacion especifica.
- Proveedor productivo, dominio HTTPS, SMTP y gestion de secretos.
- Migracion real a PostgreSQL y cola compartida; balanceador, varias replicas y migraciones coordinadas.
- Copias externas, retencion, colector, trazas, alertas y simulacros productivos.
- Pruebas de carga sostenida con datos representativos y auditoria externa de aislamiento/seguridad.

No se contrato ningun servicio ni se publicaron datos privados. GitHub Pages sigue siendo una demostracion estatica.
