# Avance 019

Fecha: 26 de septiembre de 2026. Version: v0.5.8.

## Solicitud

Continuar la preparacion del piloto y del backend PostgreSQL, preservando funciones locales, demo publica, presupuesto y documentacion.

## Resultado

Se separaron recuperacion y verificacion en un controlador HTTP compartido con repositorios SQLite/PostgreSQL. La emision reemplaza enlaces anteriores atomicamente. La recuperacion invalida sesiones y desafios MFA junto con el cambio de contrasena, preservando segundo factor activo y limpiando el alta pendiente. Outbox tiene adaptadores para ambos motores, sin guardar contenido sensible ni errores originales del proveedor.

## Evidencia

105 pruebas aprobadas, nueve nuevas; construccion estatica correcta; carga local de 200 solicitudes sin errores y 20 reportes persistidos. Se amplio la prueba PostgreSQL 16 del workflow con contratos HTTP y concurrencia de enlaces/reset entre dos pools. Manual y reporte de la semana del 21 al 27 actualizados y revisados visualmente.

## Limites

El runtime sigue en SQLite. Registro, login y gestion MFA PostgreSQL completos aun faltan, ademas de datos y trabajadores. No se migraron datos reales, no se enviaron correos reales ni se contrataron servicios. No se modifico la interfaz ni se retiraron funcionalidades.

Referencia: `docs/36-recuperacion-postgresql.md`.
