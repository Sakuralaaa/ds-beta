import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { DATA_DIR, db } from './db.js'
import { HttpError } from './auth.js'

const QUOTA = Number(process.env.DSX_FILE_QUOTA_MB ?? 200) * 1024 * 1024
const MAX_FILE = 20 * 1024 * 1024
const ID = /^[A-Za-z0-9_-]{1,80}$/

const pathOf = (userId, id) => {
  const dir = join(DATA_DIR, 'files', String(userId))
  mkdirSync(dir, { recursive: true })
  return join(dir, id)
}

export const putFile = async (user, id, req) => {
  if (!ID.test(id)) throw new HttpError(400, 'bad_file_id')
  if (db.prepare('SELECT 1 FROM files WHERE user_id = ? AND id = ?').get(user.id, id)) return { id, existed: true }
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > MAX_FILE) throw new HttpError(413, 'file_too_large')
  const used = db.prepare('SELECT file_bytes FROM users WHERE id = ?').get(user.id).file_bytes
  if (used + declared > QUOTA) throw new HttpError(507, 'quota_exceeded', '附件空间已满')
  const path = pathOf(user.id, id)
  let size = 0
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > MAX_FILE) req.destroy(new HttpError(413, 'file_too_large'))
  })
  try {
    await pipeline(req, createWriteStream(path))
  } catch (error) {
    if (existsSync(path)) unlinkSync(path)
    throw error
  }
  const mime = String(req.headers['content-type'] ?? 'application/octet-stream').slice(0, 100)
  db.prepare('INSERT INTO files (user_id, id, mime, size, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, id, mime, size, Date.now())
  db.prepare('UPDATE users SET file_bytes = file_bytes + ? WHERE id = ?').run(size, user.id)
  return { id, size }
}

export const getFile = (user, id, res) => {
  const row = ID.test(id) && db.prepare('SELECT * FROM files WHERE user_id = ? AND id = ?').get(user.id, id)
  const path = row && pathOf(user.id, id)
  if (!row || !existsSync(path)) throw new HttpError(404, 'not_found')
  res.writeHead(200, { 'content-type': row.mime, 'content-length': statSync(path).size, 'cache-control': 'private, max-age=31536000, immutable' })
  createReadStream(path).pipe(res)
}

export const listFileIds = (user) => db.prepare('SELECT id FROM files WHERE user_id = ?').all(user.id).map((r) => r.id)
