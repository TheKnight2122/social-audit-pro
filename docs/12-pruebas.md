# Pruebas

## Estado

La version v0.5.3 cuenta con 58 pruebas automatizadas, carga local desechable y una compilacion estatica reproducible.

## Cobertura actual

- Formulas, KPIs, auditoria, anomalias, filtros, rankings y comparativas.
- Salud, cabeceras, autenticacion, sesiones, CSRF, roles y persistencia.
- Registro inicial, verificacion de correo, recuperacion de contrasena y MFA TOTP.
- Organizaciones y aislamiento de cuentas, reportes y analitica.
- Cifrado de credenciales, tokens OAuth y verificadores PKCE.
- OAuth y sincronizacion de YouTube.
- Recorrido OAuth generico con PKCE desde autorizacion hasta persistencia.
- Normalizacion simulada de TikTok, X, Facebook, Instagram y LinkedIn.
- Reclamo atomico de tareas y ejecucion unica del trabajador programado.
- Generacion de PDF valido.
- Copia cifrada de WAL, integridad, esquema y referencias; claves incorrectas y manipulacion.
- Restauracion sin sobrescritura, invalidacion de sesiones/enlaces y pausa de tareas.
- Recorrido CLI y trabajador de copias sin solapamiento, con programacion y apagado comprobados.
- Monitoreo desactivado sin clave, autenticacion operativa, privacidad, correlacion, errores JSON/500/413, contadores, abortos y fallo del destino de logs.
- Bloqueos entre conexiones SQLite, renovacion, resultados tardios, timeout, apagado y cambios de permisos/revocacion.
- Accesos cruzados a reportes, historicos, publicaciones, usuarios, actividad y organizaciones; callback OAuth, CSRF y metadatos aislados.

## Comandos

```bash
npm test
npm run build
npm run test:load -- 500 10
```

## Resultado v0.5.3

Fecha: 2026-09-26.

- 58 pruebas ejecutadas.
- 58 exitosas.
- 0 fallidas.
- Compilacion estatica exitosa.
- `git diff --check` sin errores.
- Dependencias sin cambios en este avance. La consulta anterior de `npm audit --omit=dev` no reporto vulnerabilidades; no se repitio como parte de v0.5.3.
- GitHub Actions ejecuta `npm ci` y `npm test` antes de generar y publicar la demostracion.
- CI agrega una carga corta de 200 solicitudes con concurrencia 8, sin servicios externos.
- Carga local: 500 solicitudes, concurrencia 10, cero fallos y 50 reportes persistidos. Evidencia: `evidencias/carga-v053.json`; limites: `31-validacion-concurrencia-y-carga.md`.

## Verificacion visual de la base v0.5.0

- Cuenta y MFA revisados a 390 x 844 y en escritorio.
- Codigo QR, formularios y codigos de recuperacion sin desbordes.
- Consola del navegador sin errores en la revision realizada.
- Las vistas conservan rutas independientes.

## Pendiente

- Pruebas con credenciales y cuentas sandbox o reales aprobadas por cada proveedor.
- Pruebas de revocacion, expiracion y limites de cuota por red.
- Pruebas de correo SMTP real.
- Pruebas de carga productiva y sostenida, restauracion en infraestructura productiva, penetracion y despliegue de contenedor.
- Matriz automatizada contra una base PostgreSQL cuando se implemente.
