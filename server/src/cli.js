#!/usr/bin/env node
import { createInvite, listInvites, parseDuration, revokeInvite } from './invites.js'
import { db } from './db.js'

const [cmd, sub, ...rest] = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : fallback
}
const fmt = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '-')

if (cmd === 'invite' && sub === 'create') {
  const n = Number(opt('count', 1))
  for (let i = 0; i < n; i++) {
    const inv = createInvite({ uses: Number(opt('uses', 1)), expiresIn: parseDuration(opt('expires', null)), note: opt('note', null) })
    console.log(inv.code, `uses=${inv.max_uses}`, `expires=${fmt(inv.expires_at)}`)
  }
} else if (cmd === 'invite' && sub === 'list') {
  for (const i of listInvites())
    console.log(i.code, `${i.uses}/${i.max_uses}`, i.revoked ? 'REVOKED' : '', `expires=${fmt(i.expires_at)}`, i.note ?? '')
} else if (cmd === 'invite' && sub === 'revoke') {
  console.log(revokeInvite(String(rest[0] ?? '').toUpperCase()) ? 'revoked' : 'not found')
} else if (cmd === 'user' && sub === 'list') {
  for (const u of db.prepare('SELECT id, username, is_admin, created_at, file_bytes FROM users').all())
    console.log(u.id, u.username, u.is_admin ? 'admin' : '', fmt(u.created_at), `${(u.file_bytes / 1048576).toFixed(1)}MB`)
} else if (cmd === 'user' && sub === 'admin') {
  const [name, flag = 'on'] = rest
  db.prepare('UPDATE users SET is_admin = ? WHERE username = ?').run(flag === 'off' ? 0 : 1, name)
  console.log('ok')
} else if (cmd === 'user' && sub === 'delete') {
  console.log(db.prepare('DELETE FROM users WHERE username = ?').run(rest[0]).changes ? 'deleted' : 'not found')
} else {
  console.log(`用法:
  dsx invite create [--count 1] [--uses 1] [--expires 7d] [--note 备注]
  dsx invite list
  dsx invite revoke <CODE>
  dsx user list
  dsx user admin <username> [on|off]
  dsx user delete <username>`)
}
