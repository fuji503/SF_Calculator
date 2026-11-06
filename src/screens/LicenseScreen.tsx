import type { ReactNode } from 'react'
import licenseText from '../../LICENSE?raw'

const REPO_URL = 'https://github.com/fuji503/SF_Calculator'
const DOCS_LICENSE_URL = `${REPO_URL}/blob/main/docs/LICENSE.md`
const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/deed.ja'

/** 使っている主なライブラリ（すべての著作権表示とライセンス文は licenses.txt） */
const LIBRARIES: readonly { name: string; url: string; license: string }[] = [
  { name: 'React', url: 'https://react.dev/', license: 'MIT' },
  { name: 'KaTeX', url: 'https://katex.org/', license: 'MIT' },
  { name: 'Recharts', url: 'https://recharts.org/', license: 'MIT' },
  { name: 'dnd kit', url: 'https://dndkit.com/', license: 'MIT' },
  { name: 'html-to-image', url: 'https://github.com/bubkoo/html-to-image', license: 'MIT' },
]

/** ライセンス画面 */
export function LicenseScreen() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">ライセンス</h1>

      <Section title="MIT License">
        <p>
          このシミュレータのプログラムは、MIT License で公開しています（Copyright (c) 2026 fuji503）。
          ソースコードと仕様書は GitHub のリポジトリにあります：
          <ExternalLink href={REPO_URL}>{REPO_URL}</ExternalLink>
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>無料で、だれでも、どんな目的でも（商用も含めて）使えます。</li>
          <li>コピー、改変、再配布、ほかの作品への組み込みができます。</li>
          <li>条件は、コピーや改変したものに、下の著作権表示とライセンス文を残すことだけです。</li>
          <li>無保証です。使ったことで生じた損害について、作者は責任を負いません。</li>
        </ul>
        <p className="text-slate-400">この要点は参考のための日本語の説明です。正式な内容は、下の英語の原文です。</p>
      </Section>

      <Section title="仕様書（CC BY 4.0）">
        <p>
          仕様書（リポジトリの docs/）は、
          <ExternalLink href={CC_BY_URL}>クリエイティブ・コモンズ 表示 4.0 国際 ライセンス（CC BY 4.0）</ExternalLink>
          で公開しています。
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>引用、転載、翻訳、改変ができます。商用でも使えます。</li>
          <li>使うときは、作者名（fuji503）と仕様書の名前、出典へのリンク、ライセンス（CC BY 4.0）を書き、改変した場合はそのことも書いてください。</li>
          <li className="[overflow-wrap:anywhere]">表記の例：「fuji503『原子炉・遮蔽モジュール仕様書1（新規）』 https://github.com/fuji503/SF_Calculator （CC BY 4.0）」</li>
          <li>式や物理の事実そのものには著作権がないので、式を使うことは自由です。</li>
        </ul>
        <p>
          詳しくは <ExternalLink href={DOCS_LICENSE_URL}>docs/LICENSE.md</ExternalLink> を見てください。
        </p>
      </Section>

      <Section title="計算結果についての注意">
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
          計算結果は、物理モデルによる概算です。正確さは保証しません。SF の考察や学習のためのもので、実際の設計や安全の判断（特に放射線の遮蔽）には使わないでください。
        </p>
      </Section>

      <Section title="MIT License の全文（プログラム）">
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-300">
          {licenseText.trim()}
        </pre>
      </Section>

      <Section title="使っているライブラリ">
        <ul className="list-disc space-y-1 pl-6">
          {LIBRARIES.map((lib) => (
            <li key={lib.name}>
              <ExternalLink href={lib.url}>{lib.name}</ExternalLink>（{lib.license}）
            </li>
          ))}
        </ul>
        <p>
          これらが使っているライブラリも含め、すべての著作権表示とライセンス文は
          <ExternalLink href="./licenses.txt">licenses.txt</ExternalLink>
          にあります。
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-all text-sky-300 underline hover:text-sky-200">
      {children}
    </a>
  )
}
