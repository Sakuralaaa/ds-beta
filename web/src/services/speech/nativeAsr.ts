/**
 * APK：调用安卓系统语音识别（@capacitor-community/speech-recognition），
 * 不走 DeepSeek ASR 接口，中转站模式下也能用。不可用时返回 null，交给原有录音+转写。
 */
type Plugin = {
  available: () => Promise<{ available: boolean }>
  requestPermissions: () => Promise<{ speechRecognition: string }>
  checkPermissions: () => Promise<{ speechRecognition: string }>
  start: (o: Record<string, unknown>) => Promise<{ matches?: string[] }>
  stop: () => Promise<void>
  addListener: (e: string, cb: (d: { matches?: string[] }) => void) => Promise<{ remove: () => void }>
  removeAllListeners: () => Promise<void>
}

const getPlugin = (): Plugin | null => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown>; registerPlugin?: (n: string) => unknown } }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return (cap.Plugins?.SpeechRecognition ?? cap.registerPlugin?.('SpeechRecognition') ?? null) as Plugin | null
}

let checked: boolean | null = null
export const nativeAsrAvailable = async () => {
  if (checked !== null) return checked
  const p = getPlugin()
  try {
    checked = !!p && (await p.available()).available
  } catch {
    checked = false
  }
  return checked
}

export type NativeSession = { stop: () => Promise<string>; cancel: () => void }

export const startNativeAsr = async (onPartial?: (text: string) => void): Promise<NativeSession> => {
  const p = getPlugin()!
  let perm = await p.checkPermissions()
  if (perm.speechRecognition !== 'granted') perm = await p.requestPermissions()
  if (perm.speechRecognition !== 'granted') throw new DOMException('denied', 'NotAllowedError')
  let latest = ''
  await p.removeAllListeners()
  await p.addListener('partialResults', (d) => {
    if (d.matches?.[0]) {
      latest = d.matches[0]
      onPartial?.(latest)
    }
  })
  void p
    .start({ language: 'zh-CN', maxResults: 1, partialResults: true, popup: false })
    .catch(() => undefined)
  return {
    stop: async () => {
      await p.stop().catch(() => undefined)
      await new Promise((r) => setTimeout(r, 400))
      await p.removeAllListeners()
      return latest
    },
    cancel: () => {
      latest = ''
      void p.stop().catch(() => undefined)
      void p.removeAllListeners()
    },
  }
}
