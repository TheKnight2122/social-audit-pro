# ADR-003 - Enrutamiento de vistas independientes

## Situacion

La version v0.1.0 presentaba todos los modulos en una unica pagina. Los enlaces del menu solo desplazaban al usuario hacia secciones ubicadas arriba o abajo, lo que dificultaba distinguir Auditoria, Metricas y Contenido como areas de trabajo separadas.

## Opciones consideradas

1. Mantener anclas y ocultar secciones con CSS.
2. Crear un archivo HTML independiente por modulo.
3. Implementar un enrutador hash ligero en la aplicacion JavaScript.

## Decision

Implementar rutas hash y un contenedor de vista unico. Cada ruta reemplaza el contenido completo del area principal y conserva los filtros globales compartidos.

## Motivo

La solucion permite URLs directas, historial del navegador, separacion visual y reutilizacion del motor analitico sin agregar dependencias antes de definir el framework definitivo del frontend.

## Ventajas

- Modulos claramente separados.
- Navegacion directa mediante URL.
- Estado de filtros compartido.
- Sin dependencia externa adicional.

## Desventajas

- El archivo `src/app.js` concentra todavia la composicion de vistas.
- No ofrece carga diferida por modulo.

## Consecuencias

Cuando se adopte un framework o se amplie el frontend, las funciones de vista deberan separarse en componentes o modulos. El contrato de rutas puede conservarse.
