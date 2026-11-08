import type { SimModuleMeta } from './types.ts'

/** 登録されているモジュール。メニューとトップ画面はこの順に並べる */
export const simModules: readonly SimModuleMeta[] = [
  {
    id: 'solar-beaming',
    name: '太陽光集光・送光',
    summary: '多数の反射鏡で太陽光を集めて送るときの、受光地点の放射照度とスポットの大きさを計算します。',
    icon: 'mirror',
    specFile: '太陽光集光・送光モジュール仕様書3(検証版).md',
  },
  {
    id: 'laser-beaming',
    name: 'レーザ発振・送電',
    summary: 'レーザ発振器から目標へ光で電力を送るときの、ビームの広がりと受け取る電力を、発振器の方式と波長ごとに計算します。',
    icon: 'laser',
    specFile: 'レーザ発振・送電モジュール仕様書4(検証版).md',
  },
  {
    id: 'sunshade',
    name: 'サンシェード・展開軌道',
    summary: '天体に届く日射を減らす軌道上の日傘について、必要な面積・機数・質量と、配備の位置や応答の速さを計算します。',
    icon: 'shade',
    specFile: 'サンシェード・展開軌道モジュール仕様書3(検証版).md',
  },
  {
    id: 'power-thermal',
    name: '電源・排熱',
    summary: '太陽電池・原子炉・蓄電池・蓄熱体などの電源と、真空や大気中で熱を捨てるラジエータの規模を計算します。',
    icon: 'power',
    specFile: '電源・排熱モジュール仕様書3(検証版).md',
  },
  {
    id: 'reactor-shield',
    name: '原子炉・遮蔽',
    summary: '核分裂炉の熱出力から、炉心の大きさ、燃料の消費、放射線の強さ、遮蔽の厚さと質量を計算します。',
    icon: 'reactor',
    specFile: '原子炉・遮蔽モジュール仕様書1(新規).md',
  },
  {
    id: 'crater',
    name: 'クレータ造成（隕石・核爆発）',
    summary: '地球・月・火星で、隕石を落とすか核爆発を起こしてクレータを作るときの、クレータの大きさと形、噴出物の広がり、危険な範囲を計算します。',
    icon: 'crater',
    specFile: 'クレータ造成モジュール仕様書1(新規).md',
  },
  {
    id: 'space-colony',
    name: 'スペースコロニー設計',
    summary: '自転で人工重力を作るスペースコロニー（シリンダ・トーラス・球・ダンベル）の、回転、重力と気圧の分布、快適さ、外壁の厚さ、放射線遮蔽、質量を計算します。',
    icon: 'colony',
    specFile: 'スペースコロニー設計モジュール仕様書1(新規).md',
  },
]

export function findSimModule(id: string): SimModuleMeta | undefined {
  return simModules.find((m) => m.id === id)
}
