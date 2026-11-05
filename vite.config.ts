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
    // シム画面のチャンク（グラフ・数式・並び替えのライブラリ）は約 730 kB。遅れて読み込むので許容する。
    // 各モジュールの計算は別のチャンクにする（sims/loaders.ts）
    chunkSizeWarningLimit: 800,
  },
  // Worker も ES モジュールにして、モジュールの定義を必要なときだけ読み込む
  worker: { format: 'es' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
