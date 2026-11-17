import { HttpError } from './auth.js'

// 官方导出链接是华为云 OBS 预签名地址，浏览器跨域被拒（OPTIONS 403），只能由服务器代下。
// 只允许官方导出桶，避免被当成任意 URL 代理（SSRF）。
const ALLOWED_HOST = /^deepseek-chat-history-exports-[a-z0-9-]+\.obs\.[a-z0-9-]+\.myhuaweicloud\.com$/
const MAX_BYTES = Number(process.env.DSX_IMPORT_MAX_MB ?? 512) * 1024 * 1024

export const fetchOfficialExport = async (rawUrl, res) => {
  let url
  try {
    url = new URL(String(rawUrl ?? '').trim())
  } catch {
    throw new HttpError(400, 'bad_url', '链接格式不正确')
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
    throw new HttpError(400, 'not_official_export', '只支持 DeepSeek 官方「导出所有历史对话」生成的下载链接')
  }
  const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) }).catch(() => {
    throw new HttpError(502, 'fetch_failed', '下载失败，请检查网络')
  })
  if (upstream.status === 403) throw new HttpError(410, 'link_expired', '链接已过期，请在官方 App 重新导出')
  if (!upstream.ok) throw new HttpError(502, 'fetch_failed', `下载失败（${upstream.status}）`)
  const length = Number(upstream.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new HttpError(413, 'too_large', '导出文件过大')
  res.writeHead(200, { 'content-type': 'application/zip', ...(length ? { 'content-length': length } : {}) })
  let total = 0
  for await (const chunk of upstream.body) {
    total += chunk.length
    if (total > MAX_BYTES) {
      res.destroy()
      return
    }
    res.write(chunk)
  }
  res.end()
}
