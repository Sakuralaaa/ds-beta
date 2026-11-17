/**
 * 把上游一大块一大块到达的 text/thinking delta 拆成小段，按帧匀速吐出，
 * 积压越多吐得越快（约 0.6 秒内追平），其他事件保持原顺序。
 */
type Ev = { type: string; index?: number; delta?: any }

const isSplittable = (e: Ev) =>
  e.type === 'content_block_delta' &&
  (e.delta?.type === 'text_delta' || e.delta?.type === 'thinking_delta')

const textOf = (e: Ev) => (e.delta.type === 'text_delta' ? e.delta.text : e.delta.thinking) as string
const withText = (e: Ev, s: string): Ev => ({
  ...e,
  delta: e.delta.type === 'text_delta' ? { ...e.delta, text: s } : { ...e.delta, thinking: s },
})

const tick = () =>
  new Promise<void>((r) => {
    if (document.visibilityState === 'hidden') setTimeout(r, 0)
    else requestAnimationFrame(() => r())
  })

export async function* smoothStream<T extends Ev>(src: AsyncIterable<T>): AsyncGenerator<T> {
  const queue: T[] = []
  let done = false
  let error: unknown = null
  const w: { fn: (() => void) | null } = { fn: null }
  void (async () => {
    try {
      for await (const e of src) {
        queue.push(e)
        w.fn?.()
      }
    } catch (e) {
      error = e
    } finally {
      done = true
      w.fn?.()
    }
  })()

  const backlog = () => {
    let n = 0
    for (const e of queue) if (isSplittable(e)) n += textOf(e).length
    return n
  }

  for (;;) {
    if (error) throw error
    if (!queue.length) {
      if (done) break
      await new Promise<void>((r) => (w.fn = r))
      w.fn = null
      continue
    }
    const head = queue[0]!
    if (!isSplittable(head) || document.visibilityState === 'hidden') {
      queue.shift()
      yield head
      continue
    }
    // 每帧放出的字数：至少 1–2 字，积压多时按 ~36 帧追平；流结束后加快收尾
    const left = backlog()
    let budget = Math.max(done ? 6 : 2, Math.ceil(left / (done ? 12 : 36)))
    while (budget > 0 && queue.length && isSplittable(queue[0]!)) {
      const e = queue[0]!
      const s = Array.from(textOf(e))
      if (s.length <= budget) {
        queue.shift()
        budget -= s.length
        yield e
      } else {
        queue[0] = withText(e, s.slice(budget).join('')) as T
        yield withText(e, s.slice(0, budget).join('')) as T
        budget = 0
      }
    }
    await tick()
  }
  if (error) throw error
}
