import { loadFile } from '../chat/db.js'
import type { CreateMessageRequest } from './types.js'

/**
 * 管理员中转站模式：多数中转站没有 Files API，附件不上传，
 * serverId 记为 `inline:<本地附件 id>`，发请求前把原件内联成 base64（图片 / PDF）或文本。
 */
export const INLINE_PREFIX = 'inline:'
export const isInlineId = (id: string | null | undefined) => !!id?.startsWith(INLINE_PREFIX)

const memory = new Map<string, Blob>()
export const rememberInlineBlob = (id: string, blob: Blob) => memory.set(id, blob)

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** 返回替换后的请求体；没有内联附件时原样返回 */
export const inlineFiles = async (body: CreateMessageRequest): Promise<CreateMessageRequest> => {
  if (!JSON.stringify(body.messages).includes(`"file_id":"${INLINE_PREFIX}`)) return body
  const messages = await Promise.all(
    body.messages.map(async (message) => {
      if (message.role !== 'user' || typeof message.content === 'string') return message
      const content = await Promise.all(
        message.content.map(async (block): Promise<unknown> => {
          if (block.type === 'text' || !isInlineId(block.source.file_id)) return block
          const id = block.source.file_id.slice(INLINE_PREFIX.length)
          const blob = memory.get(id) ?? (await loadFile(id))
          if (!blob) return { type: 'text', text: '[附件原件已丢失]' }
          const type = blob.type || (block.type === 'image' ? 'image/png' : '')
          if (block.type === 'image' || type.startsWith('image/')) {
            const media = IMAGE_TYPES.includes(type) ? type : 'image/png'
            return { type: 'image', source: { type: 'base64', media_type: media, data: await toBase64(blob) } }
          }
          if (type === 'application/pdf') {
            return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await toBase64(blob) } }
          }
          return { type: 'text', text: `<file>\n${await blob.text()}\n</file>` }
        })
      )
      return { ...message, content } as typeof message
    })
  )
  return { ...body, messages }
}
