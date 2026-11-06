import type { ReactNode } from 'react'

/** 使い方画面（WebApp仕様書 §4.4） */
export function HowToScreen() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">使い方</h1>

      <Section title="基本の流れ">
        <ol className="list-decimal space-y-1 pl-6">
          <li>メニュー（左上の ☰）からシミュレータを選びます。</li>
          <li>計算結果カードの入力欄に値を入れます。値を変えると、すぐに計算し直します。</li>
          <li>条件を変えて比べたいときは、カードを複製するか、「＋ 新しい計算を追加」で新しいカードを作ります。</li>
        </ol>
      </Section>

      <Section title="カードの操作">
        <dl className="space-y-2">
          <Item term="追加">「＋ 新しい計算を追加」を押すと、初期値のカードがリストの先頭に入ります。</Item>
          <Item term="複製">入力値、グラフの設定、欄の開閉をそのままコピーし、元のカードのすぐ下に入れます。</Item>
          <Item term="並び替え">
            タイトルの左端のつまみ（⠿）をドラッグします。スマホでは長押ししてからドラッグします。メニュー（⋯）の「上へ／下へ」でも動かせます。
          </Item>
          <Item term="削除">メニュー（⋯）の「削除」で消します。確認してから消します。</Item>
          <Item term="タイトル">その場で書き換えられます。</Item>
        </dl>
      </Section>

      <Section title="入力と出力">
        <ul className="list-disc space-y-1 pl-6">
          <li>数値は 1.5e7 のような指数表記でも入れられます。単位を選べる欄には単位の選択が付きます。</li>
          <li>選択式の項目を選ぶと、関係するパラメータに目安の値が入ります。その後も手で書き換えられます。</li>
          <li>計算の向きによっては、入力の欄が「自動」の印の付いた出力に変わります。入力に戻すと元の値に戻ります。</li>
          <li>範囲外の値を入れると、その欄が赤枠になり、理由を表示します。</li>
          <li>出力欄の ⚠ は警告（計算は続けます）、✖ はエラー（結果は使えません）です。</li>
        </ul>
      </Section>

      <Section title="グラフ">
        <ul className="list-disc space-y-1 pl-6">
          <li>X軸に入力パラメータを1つ、Y軸に出力を1つ選びます。ほかの入力はカードの値のままで、X軸の値だけを動かして計算します。</li>
          <li>X軸の範囲、点数、線形か対数かを設定できます。今の入力値に当たる点には印が付きます。</li>
          <li>計算できない点は描かないので、線が途切れることがあります。</li>
        </ul>
      </Section>

      <Section title="保存と読込">
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-100">
          カードは画面を再読み込みしても残りますが、タブやブラウザを閉じると消えます。残したい計算は JSON で保存してください。
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>JSONで保存：カードのメニュー（⋯）から1枚ずつ保存できます。画面の上の「全件保存」では、そのシミュレータの全カードを1つのファイルに保存します。</li>
          <li>JSON読込：1枚分のファイルも、全件分のファイルも読み込めます。読み込んだカードはリストの先頭に入ります。</li>
          <li>画像で保存：カードの見た目を PNG で保存します。閉じている欄は画像に含めません。</li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
      <div className="text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  )
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 font-medium text-slate-200">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}
