# Documentacion Word

## Proposito

El archivo `docs/manuales/Manual-de-avance-Social-Audit-Pro.docx` resume el proyecto con lenguaje accesible, capturas actuales, diagramas y tablas. Complementa la documentacion tecnica en Markdown y sirve para presentaciones, revisiones y transferencia del proyecto.

El archivo `docs/manuales/Guia-visual-del-codigo-Social-Audit-Pro.docx` recorre el codigo real del repositorio mediante 21 capturas con archivo, rango de lineas, responsabilidad y relevancia. Esta pensado para incorporacion tecnica, revision del proyecto y transferencia a otros desarrolladores.

## Contenido

- Estado funcional y diferencia entre version local y publica.
- Modulos disponibles y recorrido visual.
- Arquitectura, persistencia y flujo OAuth de YouTube.
- Seguridad, privacidad, pruebas y trazabilidad.
- Historial de avances, trabajo pendiente y guia rapida.

Las imagenes fuente se conservan en `docs/assets/manual/` para poder actualizar el documento sin reutilizar capturas antiguas.

Las capturas de codigo se conservan en `docs/assets/codigo/` y deben regenerarse desde los archivos versionados cuando cambien los fragmentos documentados.

## Regla de mantenimiento

El manual debe actualizarse cuando cambien las funciones, la arquitectura, los controles de seguridad, las integraciones, el estado general o los pasos de uso. Antes de versionarlo se debe renderizar completo y revisar cada pagina para evitar recortes, desbordamientos, paginas vacias o imagenes desactualizadas.

No se deben incluir nombres personales, contrasenas, tokens, credenciales, sesiones ni datos privados en el documento o en sus capturas.
