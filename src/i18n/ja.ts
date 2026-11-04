/** 日本語の表示文字列（WebApp仕様書 §8。当面は日本語だけ） */
export const ja = {
  app: {
    name: 'SFインフラシミュレータ',
  },
  menu: {
    open: 'メニューを開く',
    close: 'メニューを閉じる',
    top: 'トップ',
    sims: 'シミュレータ一覧',
    howTo: '使い方',
    changelog: '更新履歴',
  },
  top: {
    lead: 'SF作品に登場するような宇宙インフラ（太陽光送電、レーザ送電、スペースサンシェード、電源・排熱、原子炉など）を、物理モデルに基づいて計算するシミュレータです。',
    usage: 'シミュレータを選び、パラメータを入力して結果を確かめ、条件を変えた計算結果を並べて比べられます。',
    simsHeading: 'シミュレータ',
  },
  sim: {
    explanation: 'パラメータや計算の解説',
    explanationPlaceholder: '詳しい解説は、このモジュールの計算部分ができてから書きます。',
    spec: '仕様書',
    notReady: 'このシミュレータは準備中です。計算結果カードは今後のバージョンで追加します。',
  },
  notFound: {
    title: 'ページが見つかりません',
    back: 'トップに戻る',
  },
  changelog: {
    title: '更新履歴',
  },
} as const

export const t = ja
