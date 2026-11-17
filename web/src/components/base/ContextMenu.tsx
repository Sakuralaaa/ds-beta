import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import type { MenuOption } from './Menu.js'
import { useBackHandler } from '../../services/app/back.js'
import styles from './Menu.module.css'

/** 长按弹出的菜单（移动端，仿官方 App）：全局只有一个 */
const useContextMenu = create<{ x: number; y: number; options: MenuOption[] } | null>(() => null)

export const openContextMenu = (x: number, y: number, options: MenuOption[]) => {
  navigator.vibrate?.(10)
  useContextMenu.setState({ x, y, options }, true)
}
const close = () => useContextMenu.setState(null, true)

/** 长按 450ms 触发；移动超过 10px 视为滚动取消 */
export const useLongPress = (onLongPress: (x: number, y: number) => void) => {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const cancel = () => {
    clearTimeout(timer.current)
    start.current = null
  }
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
      timer.current = setTimeout(() => {
        if (start.current) onLongPress(start.current.x, start.current.y)
        start.current = null
      }, 450)
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0]
      if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel()
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}

export const ContextMenuHost = () => {
  const menu = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useBackHandler(!!menu, close)
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null)
    const { width, height } = ref.current.getBoundingClientRect()
    const left = Math.min(Math.max(8, menu.x - width / 2), innerWidth - width - 8)
    const top = menu.y + height + 16 > innerHeight ? Math.max(8, menu.y - height - 8) : menu.y + 8
    setPos({ left, top })
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    addEventListener('scroll', close, true)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('scroll', close, true)
    }
  }, [menu])
  if (!menu) return null
  return createPortal(
    <>
      <div className={styles.mask} onClick={close} onTouchStart={close} />
      <div
        ref={ref}
        role="menu"
        className={clsx(styles.menu, styles.sheetMenu)}
        style={pos ?? { left: -9999, top: 0 }}
      >
        {menu.options.map((option) => (
          <div
            key={option.key}
            role="menuitem"
            className={clsx(styles.option, option.danger && styles.danger)}
            onClick={() => {
              close()
              option.onSelect()
            }}
          >
            <span className={styles.icon}>{option.icon}</span>
            {option.label}
          </div>
        ))}
      </div>
    </>,
    document.body
  )
}

/** 「选择文本」：全屏展示原文，可自由选择复制 */
const useSelectText = create<string | null>(() => null)
export const openSelectText = (text: string) => useSelectText.setState(text, true)
export const SelectTextHost = ({ title }: { title: string }) => {
  const text = useSelectText()
  useBackHandler(text !== null, () => useSelectText.setState(null, true))
  if (text === null) return null
  return createPortal(
    <div className={styles.selectPage}>
      <div className={styles.selectHead}>
        <button type="button" className={styles.selectBack} onClick={() => useSelectText.setState(null, true)}>
          ‹
        </button>
        <span>{title}</span>
        <span />
      </div>
      <div className={styles.selectBody}>{text}</div>
    </div>,
    document.body
  )
}
