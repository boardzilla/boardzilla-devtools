import * as esbuild from 'esbuild'
import { sassPlugin } from 'esbuild-sass-plugin'

await esbuild.build({
  format: 'iife',
  globalName: 'game',
  assetNames: 'assets/[name]-[hash]',
  loader: {
    '.png': 'file',
    '.svg': 'file',
    '.scss': 'css'
  },
  keepNames: true,
  outdir: 'game/build',
  entryPoints: ['game/src/game-interface.ts'],
  bundle: true,
  plugins: [sassPlugin()]
})
