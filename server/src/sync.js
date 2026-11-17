import { db, tx } from './db.js'
import { HttpError } from './auth.js'

const KINDS = new Set(['session', 'settings', 'keyvault'])
const MAX_DOC = 8 * 1024 * 1024
const listeners = new Map() // userId -> Set<(rev)=>void>

export const subscribe = (userId, fn) => {
  if (!listeners.has(userId)) listeners.set(userId, new Set())
  listeners.get(userId).add(fn)
  return () => listeners.get(userId)?.delete(fn)
}
const notify = (userId, rev) => listeners.get(userId)?.forEach((fn) => fn(rev))

/**
 * 会话合并：消息按 id 并集（消息树只追加，分支天然不冲突）；
 * 同 id 的消息与会话元数据（标题、选中分支等）取 updatedAt 较新的一方。
 */
const mergeSession = (current, incoming, incomingNewer) => {
  const [newer, older] = incomingNewer ? [incoming, current] : [current, incoming]
  const byId = new Map()
  for (const m of older.messages ?? []) byId.set(m.id, m)
  for (const m of newer.messages ?? []) byId.set(m.id, m)
  const order = [...(older.messages ?? []), ...(newer.messages ?? [])].map((m) => m.id)
  const seen = new Set()
  const messages = order.filter((id) => !seen.has(id) && seen.add(id)).map((id) => byId.get(id))
  return { ...older, ...newer, messages, updatedAt: Math.max(current.updatedAt ?? 0, incoming.updatedAt ?? 0) }
}

export const pull = (user, since) => {
  const rows = db
    .prepare('SELECT kind, id, rev, updated_at, deleted, data FROM docs WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT 500')
    .all(user.id, Number(since) || 0)
  const head = db.prepare('SELECT rev FROM users WHERE id = ?').get(user.id).rev
  return {
    rev: rows.length ? rows[rows.length - 1].rev : head,
    more: rows.length === 500,
    changes: rows.map((r) => ({
      kind: r.kind, id: r.id, rev: r.rev, updatedAt: r.updated_at, deleted: !!r.deleted,
      data: r.deleted ? null : JSON.parse(r.data),
    })),
  }
}

/** changes: [{kind, id, updatedAt, deleted?, data?}] */
export const push = (user, changes) => {
  if (!Array.isArray(changes) || changes.length > 200) throw new HttpError(400, 'bad_changes')
  const results = tx(() => {
    const out = []
    let rev = db.prepare('SELECT rev FROM users WHERE id = ?').get(user.id).rev
    for (const c of changes) {
      if (!KINDS.has(c?.kind) || typeof c.id !== 'string' || c.id.length > 128) throw new HttpError(400, 'bad_change')
      const updatedAt = Number(c.updatedAt) || Date.now()
      const existing = db.prepare('SELECT * FROM docs WHERE user_id = ? AND kind = ? AND id = ?').get(user.id, c.kind, c.id)
      let deleted = !!c.deleted
      let data = deleted ? null : c.data
      if (existing && existing.updated_at > updatedAt && !(c.kind === 'session' && !deleted && !existing.deleted)) {
        // 旧写入（LWW 落败）：不改，客户端下次 pull 拿到新版本
        out.push({ kind: c.kind, id: c.id, accepted: false, rev: existing.rev })
        continue
      }
      if (c.kind === 'session' && !deleted && existing && !existing.deleted) {
        data = mergeSession(JSON.parse(existing.data), data, updatedAt >= existing.updated_at)
      }
      const json = deleted ? null : JSON.stringify(data)
      if (json && json.length > MAX_DOC) throw new HttpError(413, 'doc_too_large')
      rev += 1
      db.prepare(
        `INSERT INTO docs (user_id, kind, id, rev, updated_at, deleted, data) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, kind, id) DO UPDATE SET rev = excluded.rev, updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data`
      ).run(user.id, c.kind, c.id, rev, Math.max(updatedAt, existing?.updated_at ?? 0), deleted ? 1 : 0, json)
      out.push({ kind: c.kind, id: c.id, accepted: true, rev })
    }
    db.prepare('UPDATE users SET rev = ? WHERE id = ?').run(rev, user.id)
    return { rev, results: out }
  })
  notify(user.id, results.rev)
  return results
}
