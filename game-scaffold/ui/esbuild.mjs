import * as esbuild from 'esbuild'
import { sassPlugin } from 'esbuild-sass-plugin'

await esbuild.build({
  format: 'iife',
  assetNames: 'assets/[hash]/[name]',
  loader: {
    '.png': 'file',
    '.scss': 'css'
  },
  keepNames: true,
  outdir: 'ui/build',
  entryPoints: ['ui/src/index.tsx'],
  bundle: true,
  plugins: [sassPlugin()]
})
