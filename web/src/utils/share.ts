import { showToast } from '../components/base/toastState.js'
import { copyText } from './clipboard.js'

/** 分享文本：支持系统分享（手机）就弹分享面板，否则复制到剪贴板 */
export const shareText = async (text: string, title?: string) => {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, text })
      return
    } catch {
      // 用户取消
      return
    }
  }
  if (await copyText(text)) showToast({ key: 'shareCopied' })
  else showToast({ key: 'copyFailed' })
}

/** 把整段对话（当前分支）转成纯文本分享 */
export const shareSession = async (id: string, fallbackTitle: string) => {
  const { loadSession } = await import('../services/chat/db.js')
  const { getVisibleMessages } = await import('../services/chat/branches.js')
  const session = await loadSession(id)
  if (!session) return
  const title = session.title || fallbackTitle
  const body = getVisibleMessages(session)
    .map((m) =>
      m.role === 'user'
        ? `我：${m.content}`
        : `DeepSeek：${m.blocks.flatMap((b) => (b.type === 'text' && !b.isTemplate ? [b.text] : [])).join('')}`
    )
    .join('\n\n')
  await shareText(`${title}\n\n${body}`, title)
}
