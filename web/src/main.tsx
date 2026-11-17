import { createRoot } from 'react-dom/client'
import { Root } from './app/Root.js'
import { setupTheme } from './app/theme.js'
import { FONT_SCALES, useSettings } from './services/settings.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()
if (__DSX_APP__) {
  document.documentElement.classList.add('dsx-app')
  const applyFont = (step: number | null) =>
    document.documentElement.style.setProperty('--dsx-font-scale', String(FONT_SCALES[step ?? 2] ?? 1))
  applyFont(useSettings.getState().fontStep)
  useSettings.subscribe((s) => applyFont(s.fontStep))
}

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
