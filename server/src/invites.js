import { randomBytes } from 'node:crypto'
import { db } from './db.js'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => {
  const bytes = randomBytes(10)
  let code = ''
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length]
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

/** expires: 秒数或 null */
export const createInvite = ({ uses = 1, expiresIn = null, note = null } = {}) => {
  const code = newCode()
  const now = Date.now()
  db.prepare(
    'INSERT INTO invites (code, note, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(code, note, uses, expiresIn ? now + expiresIn * 1000 : null, now)
  return getInvite(code)
}

export const getInvite = (code) => db.prepare('SELECT * FROM invites WHERE code = ?').get(code)

export const listInvites = () =>
  db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all()

export const revokeInvite = (code) =>
  db.prepare('UPDATE invites SET revoked = 1 WHERE code = ?').run(code).changes > 0

export const inviteUsable = (invite, now = Date.now()) =>
  invite && !invite.revoked && invite.uses < invite.max_uses && (!invite.expires_at || invite.expires_at > now)

/** 解析 7d / 12h / 30m / 秒数 */
export const parseDuration = (text) => {
  if (!text) return null
  const m = /^(\d+)([smhd]?)$/.exec(String(text).trim())
  if (!m) throw new Error(`无法解析时长: ${text}`)
  return Number(m[1]) * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]]
}
