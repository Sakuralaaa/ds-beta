import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import {
  HttpError, authenticate, changePassword, listDevices, login, logout, publicUser, register, revokeDevice,
} from './auth.js'
import { revokeInvite } from './invites.js'
import { pull, push, subscribe } from './sync.js'
import { getFile, listFileIds, putFile } from './files.js'
import { fetchOfficialExport } from './importFetch.js'
import { createInvites, deleteUser, listInvitesDetailed, listUsers, stats, updateUser } from './admin.js'

const PORT = Number(process.env.PORT ?? 8080)
const STATIC_DIR = process.env.DSX_STATIC_DIR ?? join(process.cwd(), '..', 'web', 'dist')
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '': 'text/plain',
}

const readJson = async (req, limit = 10 * 1024 * 1024) => {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, 'too_large')
    chunks.push(chunk)
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
  } catch {
    throw new HttpError(400, 'bad_json')
  }
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

// 简单登录限速：每 IP 每分钟 10 次
const attempts = new Map()
const limit = (req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress
  const now = Date.now()
  const list = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000)
  if (list.length >= 10) throw new HttpError(429, 'too_many_attempts', '尝试太频繁，请稍后再试')
  list.push(now)
  attempts.set(ip, list)
}

const requireAdmin = (user) => {
  if (!user.is_admin) throw new HttpError(403, 'forbidden')
}

const routes = [
  ['GET', /^\/api\/health$/, () => ({ ok: true, name: 'ds-beta' })],
  ['POST', /^\/api\/auth\/register$/, async (req) => { limit(req); return register(await readJson(req)) }],
  ['POST', /^\/api\/auth\/login$/, async (req) => { limit(req); return login(await readJson(req)) }],
  ['POST', /^\/api\/auth\/logout$/, (req) => { logout(authenticate(req)); return { ok: true } }],
  ['POST', /^\/api\/auth\/password$/, async (req) => { changePassword(authenticate(req), await readJson(req)); return { ok: true } }],
  ['GET', /^\/api\/me$/, (req) => ({ user: publicUser(authenticate(req)) })],
  ['GET', /^\/api\/devices$/, (req) => ({ devices: listDevices(authenticate(req)) })],
  ['DELETE', /^\/api\/devices\/([\w-]+)$/, (req, m) => { revokeDevice(authenticate(req), m[1]); return { ok: true } }],
  ['GET', /^\/api\/sync$/, (req) => pull(authenticate(req), new URL(req.url, 'http://x').searchParams.get('since'))],
  ['POST', /^\/api\/sync$/, async (req) => { const user = authenticate(req); return push(user, (await readJson(req, 64 * 1024 * 1024)).changes) }],
  ['GET', /^\/api\/files$/, (req) => ({ ids: listFileIds(authenticate(req)) })],
  ['PUT', /^\/api\/files\/([\w-]+)$/, async (req, m) => putFile(authenticate(req), m[1], req)],
  ['GET', /^\/api\/files\/([\w-]+)$/, (req, m, res) => { getFile(authenticate(req), m[1], res); return undefined }],
  ['POST', /^\/api\/import\/fetch$/, async (req, _m, res) => {
    authenticate(req)
    await fetchOfficialExport((await readJson(req)).url, res)
    return undefined
  }],
  ['GET', /^\/api\/admin\/stats$/, (req) => { requireAdmin(authenticate(req)); return stats() }],
  ['GET', /^\/api\/admin\/invites$/, (req) => { requireAdmin(authenticate(req)); return { invites: listInvitesDetailed() } }],
  ['POST', /^\/api\/admin\/invites$/, async (req) => {
    const admin = authenticate(req)
    requireAdmin(admin)
    return { codes: createInvites(admin, await readJson(req)) }
  }],
  ['DELETE', /^\/api\/admin\/invites\/([\w-]+)$/, (req, m) => { requireAdmin(authenticate(req)); return { ok: revokeInvite(m[1]) } }],
  ['GET', /^\/api\/admin\/users$/, (req) => { requireAdmin(authenticate(req)); return { users: listUsers() } }],
  ['PATCH', /^\/api\/admin\/users\/(\d+)$/, async (req, m) => {
    const admin = authenticate(req)
    requireAdmin(admin)
    return updateUser(admin, m[1], await readJson(req))
  }],
  ['DELETE', /^\/api\/admin\/users\/(\d+)$/, (req, m) => { const admin = authenticate(req); requireAdmin(admin); return deleteUser(admin, m[1]) }],
]

const events = (req, res) => {
  const user = authenticate(req)
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
  res.write(': hi\n\n')
  const off = subscribe(user.id, (rev) => res.write(`event: rev\ndata: ${rev}\n\n`))
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => { off(); clearInterval(ping) })
}

const serveStatic = (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = normalize(join(STATIC_DIR, pathname))
  if (!file.startsWith(normalize(STATIC_DIR))) return send(res, 403, { error: 'forbidden' })
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html')
  if (!existsSync(file)) return send(res, 404, { error: 'web build missing' })
  const isHtml = file.endsWith('.html')
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': isHtml ? 'no-cache' : 'public, max-age=86400',
  })
  createReadStream(file).pipe(res)
}

const server = createServer(async (req, res) => {
  // 安卓 App（Capacitor）跨域访问；鉴权走 Bearer，不用 Cookie，因此可放开来源
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const { pathname } = new URL(req.url, 'http://x')
  try {
    if (pathname === '/api/events') return events(req, res)
    if (!pathname.startsWith('/api/')) return serveStatic(req, res)
    for (const [method, pattern, handler] of routes) {
      const m = method === req.method && pattern.exec(pathname)
      if (m) {
        const result = await handler(req, m, res)
        if (result !== undefined) send(res, 200, result)
        return
      }
    }
    throw new HttpError(404, 'not_found')
  } catch (error) {
    if (res.headersSent) return res.destroy()
    if (error instanceof HttpError) return send(res, error.status, { error: error.code, message: error.message })
    console.error(error)
    send(res, 500, { error: 'internal' })
  }
})

server.listen(PORT, () => console.log(`ds-beta server on :${PORT}, static ${STATIC_DIR}`))
