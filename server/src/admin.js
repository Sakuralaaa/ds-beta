import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, db, tx } from './db.js'
import { HttpError } from './auth.js'
import { createInvite, parseDuration } from './invites.js'

const inviteState = (i, now = Date.now()) =>
  i.revoked ? 'revoked' : i.uses >= i.max_uses ? 'used' : i.expires_at && i.expires_at <= now ? 'expired' : 'active'

export const stats = () => {
  const one = (sql) => db.prepare(sql).get().n
  const now = Date.now()
  return {
    users: one('SELECT COUNT(*) AS n FROM users'),
    active7d: one(`SELECT COUNT(DISTINCT user_id) AS n FROM tokens WHERE last_seen > ${now - 7 * 86400e3}`),
    sessions: one("SELECT COUNT(*) AS n FROM docs WHERE kind = 'session' AND deleted = 0"),
    storageBytes: one('SELECT COALESCE(SUM(file_bytes), 0) AS n FROM users'),
    invitesActive: db.prepare('SELECT * FROM invites').all().filter((i) => inviteState(i, now) === 'active').length,
  }
}

export const listInvitesDetailed = () => {
  const usedBy = db.prepare('SELECT iu.used_at, u.username FROM invite_uses iu LEFT JOIN users u ON u.id = iu.user_id WHERE iu.code = ? ORDER BY iu.used_at')
  return db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all().map((i) => ({
    code: i.code, note: i.note, maxUses: i.max_uses, uses: i.uses, expiresAt: i.expires_at, createdAt: i.created_at,
    state: inviteState(i), usedBy: usedBy.all(i.code).map((r) => r.username ?? '(已删除)'),
  }))
}

export const createInvites = (admin, body) => {
  const count = Math.min(50, Math.max(1, Number(body.count) || 1))
  const uses = Math.min(1000, Math.max(1, Number(body.uses) || 1))
  let expiresIn
  try { expiresIn = body.expires ? parseDuration(body.expires) : null } catch { throw new HttpError(400, 'bad_expires', '有效期格式不对') }
  const note = body.note ? String(body.note).slice(0, 100) : null
  return tx(() => Array.from({ length: count }, () => createInvite({ uses, expiresIn, note, createdBy: admin.id }).code))
}

export const listUsers = () =>
  db.prepare(`
    SELECT u.id, u.username, u.is_admin, u.disabled, u.created_at, u.file_bytes,
      (SELECT MAX(last_seen) FROM tokens t WHERE t.user_id = u.id) AS last_seen,
      (SELECT COUNT(*) FROM tokens t WHERE t.user_id = u.id) AS devices,
      (SELECT COUNT(*) FROM docs d WHERE d.user_id = u.id AND d.kind = 'session' AND d.deleted = 0) AS sessions,
      (SELECT EXISTS(SELECT 1 FROM docs d WHERE d.user_id = u.id AND d.kind = 'keyvault' AND d.deleted = 0)) AS has_key,
      (SELECT iu.code FROM invite_uses iu WHERE iu.user_id = u.id LIMIT 1) AS invite_code,
      (SELECT i.note FROM invite_uses iu JOIN invites i ON i.code = iu.code WHERE iu.user_id = u.id LIMIT 1) AS invite_note
    FROM users u ORDER BY u.created_at DESC`).all().map((u) => ({
    id: u.id, username: u.username, isAdmin: !!u.is_admin, disabled: !!u.disabled, createdAt: u.created_at,
    storageBytes: u.file_bytes, lastSeen: u.last_seen, devices: u.devices, sessions: u.sessions, hasKey: !!u.has_key,
    inviteCode: u.invite_code, inviteNote: u.invite_note,
  }))

const target = (admin, id) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id))
  if (!user) throw new HttpError(404, 'not_found', '用户不存在')
  if (user.id === admin.id) throw new HttpError(400, 'self', '不能对自己执行这个操作')
  return user
}

export const updateUser = (admin, id, body) => {
  const user = target(admin, id)
  if (typeof body.isAdmin === 'boolean') db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(body.isAdmin ? 1 : 0, user.id)
  if (typeof body.disabled === 'boolean') {
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(body.disabled ? 1 : 0, user.id)
    if (body.disabled) db.prepare('DELETE FROM tokens WHERE user_id = ?').run(user.id)
  }
  if (body.logoutAll) db.prepare('DELETE FROM tokens WHERE user_id = ?').run(user.id)
  return { ok: true }
}

export const deleteUser = (admin, id) => {
  const user = target(admin, id)
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
  rmSync(join(DATA_DIR, 'files', String(user.id)), { recursive: true, force: true })
  return { ok: true }
}
