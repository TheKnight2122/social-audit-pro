# Pruebas

## Estado

La version v0.5.1 cuenta con 34 pruebas automatizadas y una compilacion estatica reproducible.

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

## Comandos

```bash
npm test
npm run build
```

## Resultado v0.5.1

Fecha: 2026-09-25.

- 34 pruebas ejecutadas.
- 34 exitosas.
- 0 fallidas.
- Compilacion estatica exitosa.
- `git diff --check` sin errores.
- `npm audit --omit=dev`: cero vulnerabilidades reportadas al consultar el registro.
- GitHub Actions ejecuta `npm ci` y `npm test` antes de generar y publicar la demostracion.

## Verificacion visual de la base v0.5.0

- Cuenta y MFA revisados a 390 x 844 y en escritorio.
- Codigo QR, formularios y codigos de recuperacion sin desbordes.
- Consola del navegador sin errores en la revision realizada.
- Las vistas conservan rutas independientes.

## Pendiente

- Pruebas con credenciales y cuentas sandbox o reales aprobadas por cada proveedor.
- Pruebas de revocacion, expiracion y limites de cuota por red.
- Pruebas de correo SMTP real.
- Pruebas de carga, restauracion en infraestructura productiva, penetracion y despliegue de contenedor.
- Matriz automatizada contra una base PostgreSQL cuando se implemente.
