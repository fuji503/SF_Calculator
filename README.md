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
