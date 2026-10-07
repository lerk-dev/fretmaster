// 临时脚本：提取 PDF 文本（FlateDecode 解压 + 文本流解析）
const fs = require('fs')
const zlib = require('zlib')

function extractPdfText(buffer) {
  const latin1 = buffer.toString('latin1')
  const texts = []
  // 匹配所有 stream ... endstream 块
  const streamRegex = /stream\r?\n?/g
  let match
  while ((match = streamRegex.exec(latin1)) !== null) {
    const start = match.index + match[0].length
    const end = latin1.indexOf('endstream', start)
    if (end === -1) continue
    const raw = buffer.subarray(start, end)
    let decoded = null
    try {
      decoded = zlib.inflateSync(raw).toString('latin1')
    } catch (e) {
      try { decoded = zlib.inflateRawSync(raw).toString('latin1') } catch (e2) { continue }
    }
    if (!decoded) continue
    // 解析文本运算符：Tj, TJ, ', "
    const textOps = []
    const tjRegex = /\((?:\\.|[^\\()])*\)\s*(Tj|'|"|\)|\])|\[(?:[^\]\\]|\\.)*\]\s*TJ/g
    let m2
    // 简化：提取 (...) Tj 和 [...] TJ
    const re = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g
    while ((m2 = re.exec(decoded)) !== null) {
      if (m2[1] !== undefined) {
        textOps.push(unescapePdf(m2[1]))
      } else if (m2[2] !== undefined) {
        // TJ 数组：提取所有字符串部分
        const parts = m2[2].match(/\((?:\\.|[^\\()])*\)/g) || []
        textOps.push(parts.map(p => unescapePdf(p.slice(1, -1))).join(''))
      }
    }
    if (textOps.length > 0) texts.push(textOps.join(' '))
  }
  return texts.join('\n')
}

function unescapePdf(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '')
    .replace(/\\f/g, '')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
}

const file = process.argv[2]
const buf = fs.readFileSync(file)
const text = extractPdfText(buf)
console.log(text)
