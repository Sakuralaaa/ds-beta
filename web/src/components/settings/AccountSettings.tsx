import { useEffect, useState } from 'react'
import { requestJson } from '../../services/account/api.js'
import { signOut, useAccount } from '../../services/account/account.js'
import { getSyncStatus, onSyncStatus, pullNow, pushNow, type SyncStatus } from '../../services/account/sync.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import styles from './AccountSettings.module.css'

export const IconAccountOutline16 = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.75" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.75 13.5c.6-2.4 2.7-3.9 5.25-3.9s4.65 1.5 5.25 3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

type Device = { id: string; device: string; lastSeen: number; current: boolean }
type Invite = { code: string; uses: number; max_uses: number; revoked: number; expires_at: number | null; note: string | null }

const zh = {
  user: '当前账号', server: '服务器', sameOrigin: '当前站点', sync: '同步状态', syncNow: '立即同步',
  status: { idle: '已同步', syncing: '同步中...', offline: '离线，联网后自动同步', error: '同步失败，稍后自动重试' },
  devices: '已登录设备', thisDevice: '本机', remove: '移除', logout: '退出登录',
  logoutHint: '退出后会清除本机的对话缓存与 API Key，服务器上的数据不受影响。',
  invites: '邀请码（管理员）', newInvite: '生成邀请码', copy: '复制', revoke: '作废', used: '已用', revoked: '已作废', expires: '到期',
  e2e: 'API Key 用你的密码在本机加密后才上传，服务器无法解密。忘记密码只能重新填写 Key。',
}
const en: typeof zh = {
  user: 'Account', server: 'Server', sameOrigin: 'This site', sync: 'Sync', syncNow: 'Sync now',
  status: { idle: 'Up to date', syncing: 'Syncing...', offline: 'Offline, will sync when online', error: 'Sync failed, retrying soon' },
  devices: 'Signed-in devices', thisDevice: 'This device', remove: 'Remove', logout: 'Log out',
  logoutHint: 'Logging out clears chats and the API key cached on this device. Data on the server is kept.',
  invites: 'Invite codes (admin)', newInvite: 'New invite', copy: 'Copy', revoke: 'Revoke', used: 'used', revoked: 'revoked', expires: 'expires',
  e2e: 'Your API key is encrypted on this device with your password before upload; the server cannot read it. If you forget the password, just re-enter the key.',
}

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const AccountSettings = () => {
  const t = useSettings((s) => s.locale) === 'zh-CN' ? zh : en
  const user = useAccount((s) => s.user)
  const [sync, setSync] = useState<SyncStatus>(getSyncStatus)
  const [devices, setDevices] = useState<Device[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  const loadDevices = () => requestJson<{ devices: Device[] }>('/api/devices').then((r) => setDevices(r.devices)).catch(() => {})
  const loadInvites = () =>
    requestJson<{ invites: Invite[] }>('/api/admin/invites').then((r) => setInvites(r.invites)).catch(() => {})

  useEffect(() => {
    const off = onSyncStatus(setSync)
    return () => {
      off()
    }
  }, [])
  useEffect(() => {
    void loadDevices()
    if (user?.isAdmin) void loadInvites()
  }, [user?.isAdmin])

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div>
          <div className={styles.label}>{t.user}</div>
          <div className={styles.value}>
            {user?.username}
            {user?.isAdmin ? <span className={styles.tag}>admin</span> : null}
          </div>
        </div>
      </div>
      <div className={styles.row}>
        <div>
          <div className={styles.label}>{t.sync}</div>
          <div className={styles.value}>{t.status[sync]}</div>
          <div className={styles.hint}>{t.e2e}</div>
        </div>
        <Button variant="outlined" size="m" onClick={() => void pushNow().then(pullNow)}>
          {t.syncNow}
        </Button>
      </div>
      <div className={styles.block}>
        <div className={styles.label}>{t.devices}</div>
        {devices.map((d) => (
          <div key={d.id} className={styles.item}>
            <span>
              {d.device || '—'}
              {d.current ? <span className={styles.tag}>{t.thisDevice}</span> : null}
            </span>
            <span className={styles.itemRight}>
              <span className={styles.hint}>{fmt(d.lastSeen)}</span>
              {!d.current ? (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => void requestJson(`/api/devices/${d.id}`, { method: 'DELETE' }).then(loadDevices)}
                >
                  {t.remove}
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {user?.isAdmin ? (
        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div className={styles.label}>{t.invites}</div>
            <Button
              variant="outlined"
              size="s"
              onClick={() =>
                void requestJson('/api/admin/invites', { method: 'POST', body: JSON.stringify({ uses: 1, expires: '7d' }) }).then(loadInvites)
              }
            >
              {t.newInvite}
            </Button>
          </div>
          {invites.slice(0, 20).map((i) => (
            <div key={i.code} className={styles.item}>
              <code className={styles.code}>{i.code}</code>
              <span className={styles.itemRight}>
                <span className={styles.hint}>
                  {i.revoked ? t.revoked : `${t.used} ${i.uses}/${i.max_uses}`}
                  {i.expires_at && !i.revoked ? ` · ${t.expires} ${fmt(i.expires_at)}` : ''}
                </span>
                {!i.revoked && i.uses < i.max_uses ? (
                  <>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => void navigator.clipboard.writeText(i.code).then(() => showToast({ key: 'copied' }))}
                    >
                      {t.copy}
                    </button>
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => void requestJson(`/api/admin/invites/${i.code}`, { method: 'DELETE' }).then(loadInvites)}
                    >
                      {t.revoke}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.row}>
        <div className={styles.hint}>{t.logoutHint}</div>
        <Button variant="dangerOutlined" size="m" onClick={() => void signOut()}>
          {t.logout}
        </Button>
      </div>
    </div>
  )
}
