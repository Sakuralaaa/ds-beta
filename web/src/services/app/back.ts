import { useEffect, useRef } from 'react'
import { plugin } from './native.js'

/**
 * 安卓返回键：后打开的层先关闭（菜单 → 全屏页 → 弹窗 → 抽屉）。
 * 没有可关闭的层时退到后台（不结束进程），和原生 App 一致。
 */
const stack: { id: number; close: () => void }[] = []
let seq = 0

export const useBackHandler = (active: boolean, close: () => void) => {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!__DSX_APP__ || !active) return
    const id = ++seq
    stack.push({ id, close: () => ref.current() })
    return () => {
      const i = stack.findIndex((e) => e.id === id)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}

type AppPlugin = {
  addListener: (e: 'backButton', cb: () => void) => Promise<unknown>
  minimizeApp: () => Promise<void>
}

export const setupBackButton = () => {
  const app = plugin<AppPlugin>('App')
  if (!app) return
  void app.addListener('backButton', () => {
    const top = stack.pop()
    if (top) top.close()
    else void app.minimizeApp()
  })
}

export const hideSplash = () => {
  const s = plugin<{ hide: (o?: { fadeOutDuration?: number }) => Promise<void> }>('SplashScreen')
  void s?.hide({ fadeOutDuration: 0 }).catch(() => undefined)
}

/** 网页层启动动画：至少播 1.1s 再淡出 */
export const finishWebSplash = () => {
  const el = document.getElementById('dsx-splash')
  if (!el) return
  const t0 = (window as any).__dsxT0 ?? performance.now()
  const wait = Math.max(0, 1100 - (performance.now() - t0))
  setTimeout(() => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 400)
  }, wait)
}
