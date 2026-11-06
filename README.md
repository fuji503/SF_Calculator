# SF_Calculator
fuji_503のSF考察用簡易計算機

公開URL：https://fuji503.github.io/SF_Calculator/

## 開発

```sh
npm install
npm run dev     # 開発サーバ
npm run lint    # oxlint
npm test        # Vitest
npm run build   # dist/ に出力
```

`main` に push すると、GitHub Actions が lint → test → build → GitHub Pages へのデプロイを行う。
仕様書は `docs/` にある（全体は `docs/WebApp仕様書.md`）。

## ライセンス

Copyright (c) 2026 fuji503

- プログラム：[MIT License](LICENSE)
- 仕様書（`docs/`）：[CC BY 4.0](docs/LICENSE.md)（引用・転載・改変ができる。作者名・出典・ライセンスを書き、改変した場合はそのことも書く）

計算結果は物理モデルによる概算で、正確さは保証しない。実際の設計や安全の判断（特に放射線の遮蔽）には使わないこと。
