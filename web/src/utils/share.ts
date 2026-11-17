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
