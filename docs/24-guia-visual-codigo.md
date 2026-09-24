# Guia visual del codigo

## Proposito

La guia `docs/manuales/Guia-visual-del-codigo-Social-Audit-Pro.docx` explica la estructura tecnica de Social Audit Pro mediante fragmentos reales del repositorio. Permite recorrer el sistema sin leer todos los archivos de principio a fin.

## Cobertura

El documento contiene 21 capturas y cubre:

- Estructura HTML, navegacion, rutas y preparacion de datos del frontend.
- Sistema visual CSS y comportamiento adaptable a movil.
- Calculo de KPIs y puntuacion de auditoria.
- Composicion de la API Express.
- Contrasenas, sesiones, cookies, permisos, CSRF y cifrado.
- Migraciones y esquema persistente en SQLite.
- OAuth, consultas oficiales y persistencia cifrada de YouTube.
- Generacion de reportes PDF, pruebas de integracion y despliegue en GitHub Pages.

Cada captura identifica el archivo y el rango exacto de lineas, y se acompana de las secciones `Que hace` y `Por que importa`.

## Archivos fuente

- Documento: `docs/manuales/Guia-visual-del-codigo-Social-Audit-Pro.docx`.
- Imagenes: `docs/assets/codigo/`.

## Mantenimiento

Las capturas deben regenerarse cuando cambie de manera relevante alguno de los fragmentos documentados. Antes de versionar una nueva guia se debe renderizar el Word completo, revisar todas sus paginas y ejecutar las auditorias de accesibilidad e imagenes.

No se deben incluir credenciales, secretos, tokens, sesiones, nombres personales ni datos privados.
