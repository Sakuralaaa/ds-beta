import { create } from 'zustand'
import { getToken, requestJson, setToken, ServerError } from './api.js'
import { deriveAuthKey, deriveEncKey } from './crypto.js'

export type AccountUser = { id: number; username: string; isAdmin: boolean; encSalt: string }

const ENC_KEY = 'dsx:enc-key'
const USER_KEY = 'dsx:user'

const readUser = (): AccountUser | null => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

export const useAccount = create<{
  status: 'checking' | 'anonymous' | 'signedIn'
  user: AccountUser | null
}>(() => ({
  status: getToken() ? 'checking' : 'anonymous',
  user: getToken() ? readUser() : null,
}))

export const getEncKey = (): string | null => {
  try {
    return localStorage.getItem(ENC_KEY)
  } catch {
    return null
  }
}

const deviceName = () => {
  const ua = navigator.userAgent
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'Linux'
  const app = /DsxApp/.test(ua) ? 'App' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  return `${app} · ${os}`
}

const finish = async (path: string, body: object, password: string) => {
  const { token, user } = await requestJson<{ token: string; user: AccountUser }>(path, {
    method: 'POST',
    body: JSON.stringify({ ...body, device: deviceName() }),
  })
  const encKey = await deriveEncKey(password, user.encSalt)
  setToken(token)
  localStorage.setItem(ENC_KEY, encKey)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  useAccount.setState({ status: 'signedIn', user })
}

export const signIn = async (username: string, password: string) =>
  finish('/api/auth/login', { username, authKey: await deriveAuthKey(username, password) }, password)

export const signUp = async (username: string, password: string, inviteCode: string) =>
  finish('/api/auth/register', { username, inviteCode, authKey: await deriveAuthKey(username, password) }, password)

const clearLocalAccount = () => {
  setToken(null)
  localStorage.removeItem(ENC_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem('dsx:sync-rev')
  useAccount.setState({ status: 'anonymous', user: null })
}

export const signOut = async () => {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' })
  } catch {
    // 离线也允许退出
  }
  clearLocalAccount()
  // 退出后清空本机对话缓存与 Key，避免下一个账号看到
  const { clearLocalData } = await import('./sync.js')
  await clearLocalData()
  location.reload()
}

export const checkSession = async () => {
  if (!getToken()) {
    useAccount.setState({ status: 'anonymous', user: null })
    return
  }
  try {
    const { user } = await requestJson<{ user: AccountUser }>('/api/me')
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    useAccount.setState({ status: 'signedIn', user })
  } catch (error) {
    if (error instanceof ServerError && error.status === 401) {
      clearLocalAccount()
    } else {
      // 离线：沿用本机缓存的账号，离线可用，恢复联网后再同步
      useAccount.setState({ status: readUser() ? 'signedIn' : 'anonymous', user: readUser() })
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('dsx:unauthorized', clearLocalAccount)
}
