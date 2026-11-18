// 安卓 APK 下载：从 GitHub Release（app-latest）拉取并缓存到 /data/app，国内经香港服务器下载更快
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './db.js'

const REPO = process.env.DSX_APP_REPO ?? 'Sakuralaaa/ds-beta'
const TAG = process.env.DSX_APP_TAG ?? 'app-latest'
const NAME = 'DeepSeek-Beta.apk'
const DIR = join(DATA_DIR, 'app')
const FILE = join(DIR, NAME)
const META = join(DIR, 'meta.json')
const PUBLIC_URL = `https://github.com/${REPO}/releases/download/${TAG}/${NAME}`
let checkedAt = 0
let pending = null

const refresh = async () => {
  mkdirSync(DIR, { recursive: true })
  const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'ds-beta' },
  })
  if (!rel.ok) throw new Error(`release ${rel.status}`)
  const asset = (await rel.json()).assets?.find((a) => a.name === NAME)
  if (!asset) throw new Error('no asset')
  let meta = {}
  try { meta = JSON.parse(await (await import('node:fs/promises')).readFile(META, 'utf8')) } catch {}
  if (meta.updated_at === asset.updated_at && existsSync(FILE)) return
  const bin = await fetch(asset.browser_download_url, { redirect: 'follow', headers: { 'user-agent': 'ds-beta' } })
  if (!bin.ok) throw new Error(`asset ${bin.status}`)
  const buf = Buffer.from(await bin.arrayBuffer())
  writeFileSync(FILE + '.tmp', buf)
  renameSync(FILE + '.tmp', FILE)
  writeFileSync(META, JSON.stringify({ updated_at: asset.updated_at }))
}

export const serveApp = async (res) => {
  if (Date.now() - checkedAt > 10 * 60_000) {
    pending ??= refresh().catch((e) => console.warn('[app] refresh failed:', e.message)).finally(() => { pending = null })
    checkedAt = Date.now()
    if (!existsSync(FILE)) await pending
  }
  if (!existsSync(FILE)) {
    res.writeHead(302, { location: PUBLIC_URL })
    return res.end()
  }
  res.writeHead(200, {
    'content-type': 'application/vnd.android.package-archive',
    'content-length': statSync(FILE).size,
    'content-disposition': `attachment; filename="${NAME}"`,
    'cache-control': 'no-store',
  })
  createReadStream(FILE).pipe(res)
}
