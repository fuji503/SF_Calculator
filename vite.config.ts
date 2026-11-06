import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * 配布する JavaScript に含めたライブラリの著作権表示とライセンス文を、licenses.txt にまとめて出力する。
 * MIT などのライセンスは、配布物に著作権表示とライセンス文を含めることを条件にしているため
 */
function thirdPartyLicenses(): Plugin {
  return {
    name: 'third-party-licenses',
    apply: 'build',
    generateBundle() {
      const dirs = new Map<string, string>()
      for (const id of this.getModuleIds()) {
        const m = /^(.*[\\/]node_modules[\\/])((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id)
        if (m) dirs.set(m[2].replace(/\\/g, '/'), m[1] + m[2])
      }
      const entries = [...dirs].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => {
        const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        const file = existsSync(dir) ? readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f)) : undefined
        const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `License: ${meta.license ?? 'unknown'}`
        return `${name}@${meta.version} (${meta.license ?? 'unknown'})\n\n${text}`
      })
      const separator = `\n\n${'-'.repeat(72)}\n\n`
      this.emitFile({
        type: 'asset',
        fileName: 'licenses.txt',
        source: `Third-party software bundled in ${pkg.name} ${pkg.version}\n\n${entries.join(separator)}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages はサブパス (/SF_Calculator/) で配信されるため相対パスでビルドする
  base: './',
  plugins: [react(), tailwindcss(), thirdPartyLicenses()],
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
