/**
 * 端到端加密：
 * - 登录凭证 authKey = PBKDF2-SHA256(密码, "dsx-auth:" + 用户名小写, 600k) —— 服务器只见到它（再做 scrypt）。
 * - 加密密钥 encKey = PBKDF2-SHA256(密码, "dsx-enc:" + encSalt, 600k) —— 只在客户端，用于 AES-256-GCM 加密 API Key。
 * 两者盐不同，服务器拿到 authKey 也推不出 encKey。
 */
const ITERATIONS = 600_000
const enc = new TextEncoder()

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

const pbkdf2 = async (password: string, salt: string): Promise<ArrayBuffer> => {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS },
    material,
    256
  )
}

export const deriveAuthKey = async (username: string, password: string) =>
  hex(await pbkdf2(password, `dsx-auth:${username.toLowerCase()}`))

/** 返回可存进本机 localStorage 的原始密钥（base64），与明文 API Key 原本就存在本机的信任边界一致。 */
export const deriveEncKey = async (password: string, encSalt: string) =>
  b64(await pbkdf2(password, `dsx-enc:${encSalt}`))

const importKey = (raw: string) =>
  crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])

export type Sealed = { v: 1; iv: string; ct: string }

export const seal = async (rawKey: string, plaintext: string): Promise<Sealed> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(rawKey), enc.encode(plaintext))
  return { v: 1, iv: b64(iv), ct: b64(ct) }
}

export const open = async (rawKey: string, sealed: Sealed): Promise<string> =>
  new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, await importKey(rawKey), unb64(sealed.ct))
  )
