/** ファイルとしてダウンロードさせる */
export function downloadUrl(fileName: string, url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  downloadUrl(fileName, url)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** ファイルを選ばせて、中身を文字列で読む。選ばなかったら null */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      file.text().then(resolve, () => resolve(null))
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
