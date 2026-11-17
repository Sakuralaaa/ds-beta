/** APK 原生桥：Capacitor 插件按名取用（不打包 JS 包，只依赖原生侧注册） */
type Cap = {
  isNativePlatform?: () => boolean
  Plugins?: Record<string, unknown>
  registerPlugin?: (name: string) => unknown
}
const cap = (): Cap | undefined => (window as unknown as { Capacitor?: Cap }).Capacitor

export const isNative = () => !!cap()?.isNativePlatform?.()

export const plugin = <T>(name: string): T | null => {
  const c = cap()
  if (!c?.isNativePlatform?.()) return null
  return ((c.Plugins?.[name] as T | undefined) ?? (c.registerPlugin?.(name) as T | undefined) ?? null)
}
