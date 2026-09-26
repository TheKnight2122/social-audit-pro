# Avance 012 - Copias cifradas y recuperacion controlada

Fecha: 2026-09-25. Version: v0.5.1.

## Objetivo

Continuar la preparacion productiva sin contratar servicios ni utilizar credenciales reales. Implementar una base de recuperacion frente a fallos de la instancia SQLite.

## Resultado

- Copias online verificadas y cifradas con AES-256-GCM y clave independiente.
- Manifiesto autenticado, suma SHA-256 y comprobacion de integridad/referencias/esquema.
- Comandos de copia, verificacion y restauracion a un archivo nuevo.
- Invalidacion de sesiones, enlaces, estados OAuth y codigos de recuperacion antiguos al restaurar.
- Programaciones pausadas tras recuperar la base y registro de restauracion.
- Trabajador opcional para copias periodicas; apagado espera las operaciones activas.
- Configuracion Docker, proteccion de archivos y exclusion de respaldos del repositorio.
- Procedimiento de recuperacion y actualizacion del manual y del informe semanal Word.

## Validacion

- Recorrido real de los tres comandos con datos desechables.
- Pruebas de clave incorrecta, manipulacion, referencias invalidas, no sobrescritura y planificacion.
- 34 pruebas automatizadas aprobadas.
- No se altero ni restauro la base de datos del usuario.
- No se activaron copias periodicas ni se modifico el archivo `.env` del usuario.

## Pendiente

Configurar y custodiar las claves antes de activar copias; definir almacenamiento externo, retencion, alertas y simulacros productivos. PostgreSQL, cola compartida, despliegue productivo y validacion de conectores reales continuan pendientes. No se contrato ningun servicio.
