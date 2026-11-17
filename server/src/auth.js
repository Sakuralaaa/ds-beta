import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db, tx } from './db.js'
import { getInvite, inviteUsable } from './invites.js'

// 客户端不发送明文密码：发送的是 PBKDF2(password, "dsx-auth:"+username) 的结果（authKey）。
// 服务端再对 authKey 做 scrypt。加密 API Key 用的密钥由客户端用 enc_salt 另行派生，服务端拿不到。
const scrypt = (authKey, salt) => scryptSync(authKey, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex')
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/
const AUTH_KEY = /^[0-9a-f]{64}$/

const issueToken = (userId, device) => {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  db.prepare('INSERT INTO tokens (token_hash, user_id, device, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run(
    sha256(token), userId, String(device ?? '').slice(0, 120), now, now
  )
  return token
}

export const publicUser = (u) => ({ id: u.id, username: u.username, isAdmin: !!u.is_admin, encSalt: u.enc_salt })

export const register = ({ username, authKey, inviteCode, device }) => {
  if (!USERNAME.test(username ?? '')) throw new HttpError(400, 'bad_username', '用户名需为 3-32 位字母、数字或 _ . -')
  if (!AUTH_KEY.test(authKey ?? '')) throw new HttpError(400, 'bad_auth_key')
  return tx(() => {
    const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
    // 第一个注册的用户自动成为管理员（仍需邀请码，邀请码用 CLI 生成）
    const firstUser = userCount === 0
    const code = String(inviteCode ?? '').trim().toUpperCase()
    const invite = code ? getInvite(code) : null
    if (!inviteUsable(invite)) throw new HttpError(403, 'bad_invite', '邀请码无效或已用完')
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'username_taken', '用户名已被占用')
    const salt = randomBytes(16).toString('hex')
    const encSalt = randomBytes(16).toString('hex')
    const now = Date.now()
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO users (username, auth_hash, auth_salt, enc_salt, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(username, scrypt(authKey, salt), salt, encSalt, firstUser ? 1 : 0, now)
    {
      db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(invite.code)
      db.prepare('INSERT INTO invite_uses (code, user_id, used_at) VALUES (?, ?, ?)').run(invite.code, id, now)
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    return { token: issueToken(id, device), user: publicUser(user) }
  })
}

export const login = ({ username, authKey, device }) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? ''))
  const ok =
    user && AUTH_KEY.test(authKey ?? '') &&
    timingSafeEqual(Buffer.from(scrypt(authKey, user.auth_salt), 'hex'), Buffer.from(user.auth_hash, 'hex'))
  if (!ok) throw new HttpError(401, 'bad_credentials', '用户名或密码错误')
  if (user.disabled) throw new HttpError(403, 'account_disabled', '账号已被管理员停用')
  return { token: issueToken(user.id, device), user: publicUser(user) }
}

export const changePassword = (user, { oldAuthKey, newAuthKey }) => {
  if (!AUTH_KEY.test(newAuthKey ?? '')) throw new HttpError(400, 'bad_auth_key')
  const ok = timingSafeEqual(Buffer.from(scrypt(oldAuthKey ?? '', user.auth_salt), 'hex'), Buffer.from(user.auth_hash, 'hex'))
  if (!ok) throw new HttpError(401, 'bad_credentials', '原密码错误')
  const salt = randomBytes(16).toString('hex')
  db.prepare('UPDATE users SET auth_hash = ?, auth_salt = ? WHERE id = ?').run(scrypt(newAuthKey, salt), salt, user.id)
}

export const authenticate = (req) => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : new URL(req.url, 'http://x').searchParams.get('token')
  if (!token) throw new HttpError(401, 'unauthorized')
  const hash = sha256(token)
  const row = db.prepare('SELECT u.*, t.token_hash FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?').get(hash)
  if (!row || row.disabled) throw new HttpError(401, 'unauthorized')
  db.prepare('UPDATE tokens SET last_seen = ? WHERE token_hash = ?').run(Date.now(), hash)
  return row
}

export const logout = (user) => db.prepare('DELETE FROM tokens WHERE token_hash = ?').run(user.token_hash)

export const listDevices = (user) =>
  db.prepare('SELECT token_hash, device, created_at, last_seen FROM tokens WHERE user_id = ? ORDER BY last_seen DESC').all(user.id)
    .map((d) => ({ id: d.token_hash.slice(0, 16), device: d.device, createdAt: d.created_at, lastSeen: d.last_seen, current: d.token_hash === user.token_hash }))

export const revokeDevice = (user, id) =>
  db.prepare("DELETE FROM tokens WHERE user_id = ? AND substr(token_hash, 1, 16) = ?").run(user.id, String(id))
