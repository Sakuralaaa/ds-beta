import { create } from 'zustand'
import { useAccount } from './account.js'

/**
 * 管理员专用：自定义 Anthropic 兼容接口（如自建中转站）。
 * 只存本机；只有当前登录账号是管理员时才生效，普通用户永远走 DeepSeek 官方。
 */
export type CustomEndpoint = { base: string; model: string }

const KEY = 'dsx:admin-endpoint'

const read = (): CustomEndpoint | null => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CustomEndpoint | null
    return value?.base ? value : null
  } catch {
    return null
  }
}

export const useCustomEndpoint = create<{ endpoint: CustomEndpoint | null }>(() => ({ endpoint: read() }))

export const setCustomEndpoint = (endpoint: CustomEndpoint | null) => {
  const clean = endpoint?.base.trim()
    ? { base: endpoint.base.trim().replace(/\/+$/, '').replace(/\/v1(\/messages)?$/, ''), model: endpoint.model.trim() }
    : null
  try {
    if (clean) localStorage.setItem(KEY, JSON.stringify(clean))
    else localStorage.removeItem(KEY)
  } catch {
    // 忽略
  }
  useCustomEndpoint.setState({ endpoint: clean })
}

/** 当前生效的自定义接口；非管理员一律返回 null */
export const activeEndpoint = (): CustomEndpoint | null =>
  useAccount.getState().user?.isAdmin ? useCustomEndpoint.getState().endpoint : null

export const clearCustomEndpoint = () => setCustomEndpoint(null)
