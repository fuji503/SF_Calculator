import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages はサブパス (/SF_Calculator/) で配信されるため相対パスでビルドする
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // シム画面のチャンク（グラフと数式のライブラリを含む）は約 730 kB。遅れて読み込むので許容する
    chunkSizeWarningLimit: 800,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
