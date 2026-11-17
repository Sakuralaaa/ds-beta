import { createRoot } from 'react-dom/client'
import { Root } from './app/Root.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()
if (__DSX_APP__) document.documentElement.classList.add('dsx-app')

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
