import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackHandler } from '../../services/app/back.js'

/** 全屏看图：黑底等比缩放，点按或返回键关闭，双指可缩放 */
export const ImageViewer = ({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) => {
  const [shown, setShown] = useState(false)
  useBackHandler(true, onClose)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return createPortal(
    <div
      role="dialog"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(0,0,0,.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: shown ? 1 : 0,
        transition: 'opacity .2s ease',
        touchAction: 'pinch-zoom',
        overflow: 'auto',
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          transform: shown ? 'scale(1)' : 'scale(.92)',
          transition: 'transform .2s ease',
        }}
      />
    </div>,
    document.body,
  )
}
