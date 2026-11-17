/**
 * ds-beta 多端同步：
 * - 会话：本地写入后去抖推送整份会话；服务器按消息 id 合并（消息树只追加，分支不冲突）。
 * - 设置：除 API Key、侧边栏状态外的偏好，整体后写覆盖。
 * - API Key：客户端 AES-GCM 加密后同步（keyvault），服务器只存密文。
 * - 图片原件：随会话上传/按需下载；非图片附件只同步元数据。
 * 拉取：启动、页面重新可见、服务器 SSE 通知、每 60 秒。
 */
import * as db from '../chat/db.js'
import { applyRemoteDelete, applyRemoteSession } from '../chat/store.js'
import type { Session } from '../chat/types.js'
import {
  setApiKey,
  setLocale,
  setLocation,
  setSearch,
  setPinned,
  setFontStep,
  setThemePreference,
  setThinking,
  setTtsVoice,
  useSettings,
} from '../settings.js'
import { apiUrl, getToken, request, requestJson } from './api.js'
import { getEncKey } from './account.js'
import { open, seal, type Sealed } from './crypto.js'

type Change = { kind: 'session' | 'settings' | 'keyvault'; id: string; updatedAt: number; deleted?: boolean; data?: unknown }
type PullResult = { rev: number; more: boolean; changes: (Change & { rev: number })[] }

const REV_KEY = 'dsx:sync-rev'
const DIRTY_KEY = 'dsx:sync-dirty'

const readRev = () => Number(localStorage.getItem(REV_KEY) ?? 0) || 0
const writeRev = (rev: number) => localStorage.setItem(REV_KEY, String(rev))

/** 待推送：会话 id → 'upsert' | 'delete'；另有 settings / keyvault 标记。持久化以防推送前关页。 */
const dirty: Map<string, 'upsert' | 'delete'> = new Map(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]') as [string, 'upsert' | 'delete'][]
    } catch {
      return []
    }
  })()
)
const saveDirty = () => localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty]))

let applyingSettings = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
let pulling: Promise<void> | null = null
let pushing: Promise<void> | null = null
let serverFiles: Set<string> | null = null

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'
const statusListeners = new Set<(status: SyncStatus) => void>()
let status: SyncStatus = 'idle'
const setStatus = (next: SyncStatus) => {
  status = next
  statusListeners.forEach((listener) => listener(next))
}
export const getSyncStatus = () => status
export const onSyncStatus = (listener: (s: SyncStatus) => void) => {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

const schedulePush = (delay = 1500) => {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushNow(), delay)
}

const markDirty = (key: string, type: 'upsert' | 'delete') => {
  dirty.set(key, type)
  saveDirty()
  schedulePush()
}

const settingsSnapshot = () => {
  const { locale, themePreference, location, ttsVoice, thinking, search, pinned, fontStep } = useSettings.getState()
  return { locale, themePreference, location, ttsVoice, thinking, search, pinned, fontStep }
}

const ensureServerFiles = async () => {
  serverFiles ??= new Set((await requestJson<{ ids: string[] }>('/api/files')).ids)
  return serverFiles
}

const uploadSessionFiles = async (session: Session) => {
  const ids = session.messages.flatMap((m) => (m.role === 'user' ? m.files.filter((f) => f.isImage).map((f) => f.id) : []))
  if (ids.length === 0) return
  const known = await ensureServerFiles()
  for (const id of ids) {
    if (known.has(id)) continue
    const blob = await db.loadFile(id)
    if (!blob) continue
    try {
      await request(`/api/files/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': blob.type || 'application/octet-stream' },
      })
      known.add(id)
    } catch {
      // 配额满等错误不阻塞会话同步
    }
  }
}

const downloadSessionFiles = async (session: Session) => {
  const files = session.messages.flatMap((m) => (m.role === 'user' ? m.files.filter((f) => f.isImage) : []))
  for (const file of files) {
    if (await db.loadFile(file.id)) continue
    try {
      const blob = await (await request(`/api/files/${encodeURIComponent(file.id)}`)).blob()
      await db.saveFiles([{ id: file.id, blob }])
    } catch {
      // 服务器上没有原件时只显示文件名
    }
  }
}

const buildChanges = async (keys: [string, 'upsert' | 'delete'][]): Promise<Change[]> => {
  const changes: Change[] = []
  const now = Date.now()
  for (const [key, type] of keys) {
    if (key === '@settings') {
      changes.push({ kind: 'settings', id: 'prefs', updatedAt: now, data: settingsSnapshot() })
    } else if (key === '@keyvault') {
      const apiKey = useSettings.getState().apiKey
      const encKey = getEncKey()
      if (!encKey) continue
      changes.push(
        apiKey
          ? { kind: 'keyvault', id: 'apiKey', updatedAt: now, data: await seal(encKey, apiKey) }
          : { kind: 'keyvault', id: 'apiKey', updatedAt: now, deleted: true }
      )
    } else if (type === 'delete') {
      changes.push({ kind: 'session', id: key, updatedAt: now, deleted: true })
    } else {
      const session = await db.loadSession(key)
      if (!session) {
        changes.push({ kind: 'session', id: key, updatedAt: now, deleted: true })
        continue
      }
      // 正在生成的会话：生成结束保存时会再次触发推送
      if (session.messages.some((m) => m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming'))) {
        continue
      }
      await uploadSessionFiles(session)
      changes.push({ kind: 'session', id: key, updatedAt: Math.max(session.updatedAt, now), data: session })
    }
  }
  return changes
}

export const pushNow = async (): Promise<void> => {
  if (!getToken() || dirty.size === 0) return
  if (pushing) {
    await pushing
    if (dirty.size > 0) schedulePush(200)
    return
  }
  pushing = (async () => {
    setStatus('syncing')
    try {
      while (dirty.size > 0) {
        const batch = [...dirty].slice(0, 20)
        const changes = await buildChanges(batch)
        if (changes.length > 0) {
          await requestJson('/api/sync', { method: 'POST', body: JSON.stringify({ changes }) })
        }
        for (const [key, type] of batch) {
          if (dirty.get(key) === type) dirty.delete(key)
        }
        saveDirty()
      }
      setStatus('idle')
    } catch {
      setStatus(navigator.onLine ? 'error' : 'offline')
      schedulePush(15_000)
    } finally {
      pushing = null
    }
  })()
  return pushing
}

const applyChange = async (change: Change) => {
  if (change.kind === 'session') {
    // 本地还有未推送修改时先不覆盖，推送后服务器合并再下发
    if (dirty.has(change.id)) return
    if (change.deleted) {
      await applyRemoteDelete(change.id)
    } else {
      const session = change.data as Session
      await applyRemoteSession(session)
      void downloadSessionFiles(session)
    }
  } else if (change.kind === 'settings' && !change.deleted && !dirty.has('@settings')) {
    const data = change.data as ReturnType<typeof settingsSnapshot>
    applyingSettings = true
    try {
      const current = useSettings.getState()
      if (data.locale && data.locale !== current.locale) setLocale(data.locale)
      if (data.themePreference && data.themePreference !== current.themePreference) setThemePreference(data.themePreference)
      if (JSON.stringify(data.location) !== JSON.stringify(current.location)) setLocation(data.location)
      if (data.ttsVoice && data.ttsVoice !== current.ttsVoice) setTtsVoice(data.ttsVoice)
      if (typeof data.thinking === 'boolean' && data.thinking !== current.thinking) setThinking(data.thinking)
      if (typeof data.search === 'boolean' && data.search !== current.search) setSearch(data.search)
      if (Array.isArray(data.pinned) && JSON.stringify(data.pinned) !== JSON.stringify(current.pinned)) setPinned(data.pinned)
      if (data.fontStep !== undefined && data.fontStep !== current.fontStep) setFontStep(data.fontStep)
    } finally {
      applyingSettings = false
    }
  } else if (change.kind === 'keyvault' && !dirty.has('@keyvault')) {
    const encKey = getEncKey()
    applyingSettings = true
    try {
      if (change.deleted) {
        if (useSettings.getState().apiKey) setApiKey(null)
      } else if (encKey) {
        const apiKey = await open(encKey, change.data as Sealed)
        if (apiKey !== useSettings.getState().apiKey) setApiKey(apiKey)
      }
    } catch {
      // 解密失败（例如密码已在其他设备修改）：保留本机 Key
    } finally {
      applyingSettings = false
    }
  }
}

export const pullNow = async (): Promise<void> => {
  if (!getToken()) return
  if (pulling) return pulling
  pulling = (async () => {
    setStatus('syncing')
    try {
      let more = true
      while (more) {
        const result = await requestJson<PullResult>(`/api/sync?since=${readRev()}`)
        for (const change of result.changes) {
          await applyChange(change)
        }
        writeRev(result.rev)
        more = result.more
      }
      setStatus('idle')
    } catch {
      setStatus(navigator.onLine ? 'error' : 'offline')
    } finally {
      pulling = null
    }
  })()
  return pulling
}

/** 首次在本设备登录：把本机已有的会话全部推上去（合并，不会丢服务器上的） */
const seedLocal = async () => {
  if (localStorage.getItem(REV_KEY) !== null) return
  for (const id of await db.loadAllSessionIds()) dirty.set(id, 'upsert')
  if (!localStorage.getItem('dsx:settings-seeded')) {
    localStorage.setItem('dsx:settings-seeded', '1')
  }
  saveDirty()
}

let started = false
export const startSync = async () => {
  if (started) return
  started = true
  await seedLocal()
  db.onLocalChange((changes) => changes.forEach((c) => markDirty(c.id, c.type)))
  let previous = useSettings.getState()
  useSettings.subscribe((state) => {
    const prev = previous
    previous = state
    if (applyingSettings) return
    if (state.apiKey !== prev.apiKey) markDirty('@keyvault', 'upsert')
    const keys = ['locale', 'themePreference', 'location', 'ttsVoice', 'thinking', 'search', 'pinned', 'fontStep'] as const
    if (keys.some((k) => state[k] !== prev[k])) markDirty('@settings', 'upsert')
  })
  // 首次同步：先拉服务器（含 Key），再推本机
  await pullNow()
  // 新账号第一次登录且服务器没有 Key 时，把本机 Key 加密上传
  if (readRev() === 0 && useSettings.getState().apiKey) markDirty('@keyvault', 'upsert')
  await pushNow()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pullNow()
    else void pushNow()
  })
  window.addEventListener('online', () => {
    void pushNow().then(pullNow)
  })
  setInterval(() => void pullNow(), 60_000)
  connectEvents()
}

const connectEvents = () => {
  const token = getToken()
  if (!token || typeof EventSource === 'undefined') return
  const source = new EventSource(apiUrl(`/api/events?token=${encodeURIComponent(token)}`))
  source.addEventListener('rev', (event) => {
    if (Number((event as MessageEvent).data) > readRev()) void pullNow()
  })
}

/** 退出登录：清空本机对话、原件、Key 与同步游标 */
export const clearLocalData = async () => {
  localStorage.removeItem(DIRTY_KEY)
  localStorage.removeItem(REV_KEY)
  localStorage.removeItem('chat-demo:api-key')
  localStorage.removeItem('dsx:admin-endpoint')
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('chat-demo')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}
