/** ds-beta 后端访问：服务器地址（网页端默认同源，安卓 App 需填写）、令牌、请求封装。 */
const SERVER_KEY = 'dsx:server'
const TOKEN_KEY = 'dsx:token'

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

/** 是否运行在 Capacitor 原生壳里（此时页面来源不是服务器） */
export const isNativeApp = (): boolean =>
  typeof window !== 'undefined' &&
  ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false)

export const getServer = (): string => read(SERVER_KEY) ?? ''
export const setServer = (url: string) => write(SERVER_KEY, url.trim().replace(/\/+$/, '') || null)
export const getToken = (): string | null => read(TOKEN_KEY)
export const setToken = (token: string | null) => write(TOKEN_KEY, token)

export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const apiUrl = (path: string) => `${getServer()}${path}`

export const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json')
  let response: Response
  try {
    response = await fetch(apiUrl(path), { ...init, headers })
  } catch {
    throw new ServerError(0, 'network', '无法连接服务器')
  }
  if (!response.ok) {
    let body: { error?: string; message?: string } = {}
    try {
      body = await response.json()
    } catch {
      // ignore
    }
    if (response.status === 401 && body.error === 'unauthorized') {
      window.dispatchEvent(new Event('dsx:unauthorized'))
    }
    throw new ServerError(response.status, body.error ?? 'error', body.message ?? `请求失败（${response.status}）`)
  }
  return response
}

export const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> =>
  (await request(path, init)).json() as Promise<T>

export const fetchOfficialExport = async (url: string): Promise<Blob> =>
  (await request('/api/import/fetch', { method: 'POST', body: JSON.stringify({ url }) })).blob()
