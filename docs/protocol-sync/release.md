# Publicación del paquete

El fork se publica como `@synapse-ve/baileys` en GitHub Packages. No se publica
en npm público ni se envía nada a WhiskeySockets.

## Esquema de versión

`7.0.0-rc14.sync.N`: la base es la última release de la que se partió y `N`
cuenta los cortes propios. La versión de WhatsApp que anuncia el cliente se
actualiza aparte (`src/Defaults/baileys-version.json`) y no tiene que coincidir
con la versión del paquete.

## Cómo publicar

1. Actualizar `version` en `package.json` (por ejemplo `7.0.0-rc14.sync.3`).
2. Commit en una rama, PR y merge a `master`.
3. Crear el tag `v<version>` sobre `master` y pushearlo:

   ```bash
   git tag -a v7.0.0-rc14.sync.3 -m "7.0.0-rc14.sync.3"
   git push fork v7.0.0-rc14.sync.3
   ```

4. El workflow `Publish Package` corre lint, tests, `npm publish` contra
   `https://npm.pkg.github.com` y crea el release de GitHub.

## Consumir el paquete

`npm install @synapse-ve/baileys --registry=https://npm.pkg.github.com`

El registro de GitHub Packages pide autenticación incluso para paquetes
públicos. En el proyecto consumidor:

```ini
@synapse-ve:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

El token necesita `read:packages`.

## Verificación

- `npm pack --dry-run` debe incluir `lib/`, `WAProto/` y
  `scripts/patch-libsignal.cjs`.
- Tras publicar, la versión aparece en la pestaña Packages del repositorio.
- Si el workflow falla, el tag queda creado igual: corregir y publicar una
  versión nueva en lugar de reutilizar el tag.
