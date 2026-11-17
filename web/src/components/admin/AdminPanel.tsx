import { useEffect, useMemo, useState } from 'react'
import { getServer, requestJson, ServerError } from '../../services/account/api.js'
import { useAccount } from '../../services/account/account.js'
import { setCustomEndpoint, useCustomEndpoint } from '../../services/account/endpoint.js'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { useSettings } from '../../services/settings.js'
import { WhaleLogo } from '../brand/WhaleLogo.js'
import styles from './AdminPanel.module.css'

type Stats = { users: number; active7d: number; sessions: number; storageBytes: number; invitesActive: number }
type InviteState = 'active' | 'used' | 'expired' | 'revoked'
type Invite = {
  code: string; note: string | null; maxUses: number; uses: number; expiresAt: number | null
  createdAt: number; state: InviteState; usedBy: string[]
}
type User = {
  id: number; username: string; isAdmin: boolean; disabled: boolean; createdAt: number; storageBytes: number
  lastSeen: number | null; devices: number; sessions: number; hasKey: boolean; inviteCode: string | null; inviteNote: string | null
}

export const ADMIN_HASH = '#admin'
export const openAdmin = () => { location.hash = ADMIN_HASH }
const closeAdmin = () => { history.replaceState(null, '', location.pathname + location.search); dispatchEvent(new HashChangeEvent('hashchange')) }

const STATE_LABEL: Record<InviteState, string> = { active: '可用', used: '已用完', expired: '已过期', revoked: '已作废' }
const EXPIRES = [['1d', '1 天'], ['7d', '7 天'], ['30d', '30 天'], ['', '永久']] as const

const fmt = (t: number | null) =>
  t ? new Date(t).toLocaleString('zh-CN', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const ago = (t: number | null) => {
  if (!t) return '从未'
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 2) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  if (m < 1440) return `${Math.round(m / 60)} 小时前`
  return `${Math.round(m / 1440)} 天前`
}
const mb = (b: number) => (b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`)
const siteUrl = () => getServer() || location.origin

const inviteText = (codes: string[]) =>
  `邀请你试用 DeepSeek Beta（非官方实验版，需要自备 DeepSeek 官方 API Key）\n` +
  `地址：${siteUrl()}\n` +
  (codes.length === 1 ? `邀请码：${codes[0]}\n` : `邀请码（每人一个）：\n${codes.join('\n')}\n`) +
  `打开后点「注册」，填用户名、密码和邀请码即可。`

const useToast = () => {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 1800)
    return () => clearTimeout(t)
  }, [msg])
  return [msg, setMsg] as const
}

export const AdminPanel = () => {
  const me = useAccount((s) => s.user)
  const [toast, setToast] = useToast()
  const [stats, setStats] = useState<Stats | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState<'all' | InviteState>('active')
  const [form, setForm] = useState({ count: 1, uses: 1, expires: '7d', note: '' })
  const [fresh, setFresh] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const copy = (text: string, what = '已复制') =>
    void navigator.clipboard.writeText(text).then(() => setToast(what), () => setToast('复制失败，请手动选择'))
  const fail = (e: unknown) => setToast(e instanceof ServerError ? e.message : String(e))

  const load = () => {
    void requestJson<Stats>('/api/admin/stats').then(setStats).catch(fail)
    void requestJson<{ invites: Invite[] }>('/api/admin/invites').then((r) => setInvites(r.invites)).catch(fail)
    void requestJson<{ users: User[] }>('/api/admin/users').then((r) => setUsers(r.users)).catch(fail)
  }
  useEffect(load, [])

  const generate = async () => {
    setBusy(true)
    try {
      const { codes } = await requestJson<{ codes: string[] }>('/api/admin/invites', {
        method: 'POST', body: JSON.stringify(form),
      })
      setFresh(codes)
      load()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const act = (path: string, init: RequestInit, done: string) =>
    void requestJson(path, init).then(() => { setToast(done); load() }).catch(fail)
  const patchUser = (u: User, body: object, done: string) =>
    act(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) }, done)

  const shown = useMemo(() => invites.filter((i) => filter === 'all' || i.state === filter), [invites, filter])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invites.length }
    for (const i of invites) c[i.state] = (c[i.state] ?? 0) + 1
    return c
  }, [invites])

  if (!me?.isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>只有管理员账号可以打开管理后台。<button className={styles.link} onClick={closeAdmin}>返回</button></div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <WhaleLogo size={26} withWordmark />
          <span className={styles.title}>管理后台</span>
        </div>
        <button type="button" className={styles.ghost} onClick={closeAdmin}>返回对话</button>
      </header>

      <main className={styles.main}>
        <section className={styles.stats}>
          {[
            ['用户', stats?.users], ['7 天活跃', stats?.active7d], ['对话总数', stats?.sessions],
            ['附件占用', stats ? mb(stats.storageBytes) : undefined], ['可用邀请码', stats?.invitesActive],
          ].map(([label, value]) => (
            <div key={label as string} className={styles.stat}>
              <div className={styles.statValue}>{value ?? '—'}</div>
              <div className={styles.statLabel}>{label}</div>
            </div>
          ))}
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>生成邀请码</h2>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>数量</span>
              <input type="number" min={1} max={50} value={form.count}
                onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} />
            </label>
            <label className={styles.field}>
              <span>每个可用次数</span>
              <input type="number" min={1} max={1000} value={form.uses}
                onChange={(e) => setForm({ ...form, uses: Number(e.target.value) })} />
            </label>
            <label className={styles.field}>
              <span>有效期</span>
              <select value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })}>
                {EXPIRES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className={`${styles.field} ${styles.grow}`}>
              <span>备注（发给谁）</span>
              <input placeholder="例如：小王 / 某群" maxLength={100} value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void generate()}>
              {busy ? '生成中…' : '生成'}
            </button>
          </div>
          {fresh.length ? (
            <div className={styles.fresh}>
              <div className={styles.freshCodes}>{fresh.map((c) => <code key={c}>{c}</code>)}</div>
              <pre className={styles.preview}>{inviteText(fresh)}</pre>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={() => copy(inviteText(fresh), '邀请文案已复制，直接粘贴发送')}>复制邀请文案</button>
                <button type="button" className={styles.ghost} onClick={() => copy(fresh.join('\n'), '邀请码已复制')}>只复制邀请码</button>
                {'share' in navigator ? (
                  <button type="button" className={styles.ghost}
                    onClick={() => void navigator.share({ text: inviteText(fresh) }).catch(() => {})}>分享…</button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.h2}>邀请码</h2>
            <div className={styles.tabs}>
              {(['active', 'used', 'expired', 'revoked', 'all'] as const).map((f) => (
                <button key={f} type="button" className={filter === f ? styles.tabOn : styles.tab} onClick={() => setFilter(f)}>
                  {f === 'all' ? '全部' : STATE_LABEL[f]} {counts[f] ?? 0}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>邀请码</th><th>备注</th><th>使用</th><th>使用者</th><th>到期</th><th>状态</th><th /></tr></thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.code}>
                    <td><code>{i.code}</code></td>
                    <td>{i.note ?? '—'}</td>
                    <td>{i.uses}/{i.maxUses}</td>
                    <td>{i.usedBy.join('、') || '—'}</td>
                    <td>{i.expiresAt ? fmt(i.expiresAt) : '永久'}</td>
                    <td><span className={styles[`s_${i.state}`]}>{STATE_LABEL[i.state]}</span></td>
                    <td className={styles.rowActions}>
                      {i.state === 'active' ? (
                        <>
                          <button className={styles.link} onClick={() => copy(inviteText([i.code]), '邀请文案已复制')}>复制文案</button>
                          <button className={styles.link} onClick={() => copy(i.code)}>复制码</button>
                          <button className={styles.danger}
                            onClick={() => confirm(`作废邀请码 ${i.code}？`) && act(`/api/admin/invites/${i.code}`, { method: 'DELETE' }, '已作废')}>作废</button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!shown.length ? <tr><td colSpan={7} className={styles.none}>没有记录</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>用户</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>用户名</th><th>来源</th><th>注册</th><th>最近活跃</th><th>对话</th><th>设备</th><th>Key</th><th>附件</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.disabled ? styles.dim : undefined}>
                    <td>
                      {u.username}
                      {u.isAdmin ? <span className={styles.tagBlue}>管理员</span> : null}
                      {u.disabled ? <span className={styles.tagRed}>已停用</span> : null}
                      {u.id === me.id ? <span className={styles.tag}>我</span> : null}
                    </td>
                    <td>{u.inviteNote ?? u.inviteCode ?? '—'}</td>
                    <td>{fmt(u.createdAt)}</td>
                    <td>{ago(u.lastSeen)}</td>
                    <td>{u.sessions}</td>
                    <td>{u.devices}</td>
                    <td>{u.hasKey ? '已填' : '未填'}</td>
                    <td>{mb(u.storageBytes)}</td>
                    <td className={styles.rowActions}>
                      {u.id !== me.id ? (
                        <>
                          <button className={styles.link}
                            onClick={() => patchUser(u, { isAdmin: !u.isAdmin }, u.isAdmin ? '已取消管理员' : '已设为管理员')}>
                            {u.isAdmin ? '取消管理员' : '设为管理员'}
                          </button>
                          <button className={styles.link} onClick={() => patchUser(u, { logoutAll: true }, '已让该用户所有设备下线')}>强制下线</button>
                          <button className={styles.link}
                            onClick={() => patchUser(u, { disabled: !u.disabled }, u.disabled ? '已启用' : '已停用并下线')}>
                            {u.disabled ? '启用' : '停用'}
                          </button>
                          <button className={styles.danger}
                            onClick={() => confirm(`删除用户 ${u.username}？他在服务器上的对话、设置和附件会一并删除，无法恢复。`) &&
                              act(`/api/admin/users/${u.id}`, { method: 'DELETE' }, '已删除')}>删除</button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <EndpointCard onToast={setToast} />
      </main>
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  )
}

/** 管理员专用：模型接口改走自己的中转站 */
const EndpointCard = ({ onToast }: { onToast: (m: string) => void }) => {
  const endpoint = useCustomEndpoint((s) => s.endpoint)
  const apiKey = useSettings((s) => s.apiKey)
  const [base, setBase] = useState(endpoint?.base ?? '')
  const [model, setModel] = useState(endpoint?.model ?? '')
  const [testing, setTesting] = useState(false)

  const test = async () => {
    if (!apiKey) return onToast('先在设置里填好中转站的 Key')
    setTesting(true)
    try {
      await verifyApiKey(apiKey)
      onToast('连接正常')
    } catch (e) {
      onToast(`连接失败：${e instanceof ApiError ? `${e.status ?? ''} ${e.message}` : String(e)}`)
    } finally { setTesting(false) }
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.h2}>模型接口（仅管理员）</h2>
        <span className={endpoint ? styles.s_active : styles.s_used}>{endpoint ? '正在使用中转站' : '使用 DeepSeek 官方'}</span>
      </div>
      <p className={styles.hint}>
        只对你这个管理员账号、在这台设备上生效；其他用户始终直连 api.deepseek.com。
        中转站需要支持 Anthropic 兼容接口（/v1/messages）。地址填到 /v1 之前，例如 https://relay.example.com 或 https://api.deepseek.com/anthropic。
        设置后在「设置 → 数据管理」里填中转站的 Key。联网搜索、语音等 DeepSeek 专有功能取决于中转站是否转发。
      </p>
      <div className={styles.formRow}>
        <label className={`${styles.field} ${styles.grow}`}>
          <span>接口地址</span>
          <input placeholder="https://relay.example.com" inputMode="url" autoCapitalize="off" value={base}
            onChange={(e) => setBase(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>模型名（可选）</span>
          <input placeholder="默认 deepseek-flash" autoCapitalize="off" value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary}
          onClick={() => { setCustomEndpoint(base.trim() ? { base, model } : null); onToast(base.trim() ? '已保存，新消息走中转站' : '已恢复官方接口') }}>
          保存
        </button>
        <button type="button" className={styles.ghost} disabled={testing} onClick={() => void test()}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        {endpoint ? (
          <button type="button" className={styles.ghost}
            onClick={() => { setCustomEndpoint(null); setBase(''); setModel(''); onToast('已恢复官方接口') }}>恢复官方</button>
        ) : null}
      </div>
    </section>
  )
}
