# Manual de instalacion

## Requisitos previos

- Node.js 20 o superior.
- npm.
- Navegador moderno.

## Pasos de instalacion

1. Clonar o abrir el repositorio.
2. Ejecutar:

```bash
npm install
```

3. Copiar `.env.example` como `.env` y definir al menos un `TOKEN_ENCRYPTION_KEY` largo y aleatorio.

4. Iniciar el servidor local:

```bash
npm start
```

5. Abrir:

```text
http://localhost:4173
```

6. En la primera instalacion, abrir `http://localhost:4173/#/cuenta` y crear el administrador inicial.

La base se crea por defecto en `data/social-audit-pro.sqlite`. No debe versionarse.

## Verificacion

Ejecutar:

```bash
npm test
```

Las pruebas deben finalizar correctamente.
