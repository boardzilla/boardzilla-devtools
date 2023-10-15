import * as esbuild from 'esbuild'
import { sassPlugin } from 'esbuild-sass-plugin'

await esbuild.build({
  format: 'iife',
  assetNames: 'assets/[name]-[hash]',
  loader: {
    '.png': 'file',
    '.svg': 'file',
    '.scss': 'css',
    '.ogg': 'dataurl',
  },
  keepNames: true,
  outdir: 'ui/build',
  entryPoints: ['ui/src/index.tsx'],
  bundle: true,
  plugins: [sassPlugin()]
})
