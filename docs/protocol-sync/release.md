# Publicación del paquete

El fork se publica como `@synapse-ve/baileys` en **npmjs.com**. No se envía
nada a WhiskeySockets. GitHub Packages queda solo como espejo histórico de
las versiones anteriores; las nuevas versiones van a npm público.

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
   `https://registry.npmjs.org` usando el secreto `NPM_TOKEN`, y crea el
   release de GitHub.

## Consumir el paquete

```bash
npm install @synapse-ve/baileys
```

El paquete es público en npmjs: **no requiere token ni `.npmrc`**. Para
prereleases, `npm install @synapse-ve/baileys@next` o una versión exacta.

## Verificación

- `npm pack --dry-run` debe incluir `lib/`, `WAProto/` y
  `scripts/patch-libsignal.cjs`.
- Tras publicar, `npm view @synapse-ve/baileys version` y
  `npm install @synapse-ve/baileys@<versión>` funcionan sin autenticación.
- Si el workflow falla, el tag queda creado igual: corregir y publicar una
  versión nueva en lugar de reutilizar el tag.

## Política de releases (A + D)

- Los tags con guion (`-rc`, `-sync`) crean un GitHub Release **prerelease**.
  No se marcan como Latest: GitHub no permite que un prerelease sea Latest.
- Un tag estable (`vX.Y.Z`, sin guion) crea el release con `--latest`.
- El dist-tag de npm es independiente: los prereleases se publican con
  `--tag next`; solo una versión estable mueve `latest`.
- Por eso, mientras la línea sea `v7.0.0-rc14.sync.N`, la página de Releases
  no muestra un “Latest”; el primer `v7.0.0` estable lo hará.
