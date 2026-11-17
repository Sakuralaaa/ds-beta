import clsx from 'clsx'
import { useState, type FormEvent } from 'react'
import { getServer, isNativeApp, ServerError, setServer } from '../../services/account/api.js'
import { signIn, signUp } from '../../services/account/account.js'
import { useSettings } from '../../services/settings.js'
import { WhaleLogo } from '../brand/WhaleLogo.js'
import styles from './AuthScreen.module.css'

const text = {
  'zh-CN': {
    subtitle: '非官方实验版 · 使用你自己的 DeepSeek API Key',
    login: '登录',
    register: '注册',
    username: '用户名',
    password: '密码',
    passwordAgain: '再次输入密码',
    invite: '邀请码',
    server: '服务器地址',
    serverHint: '例如 https://ds.example.com',
    toRegister: '有邀请码？立即注册',
    toLogin: '已有账号？去登录',
    mismatch: '两次输入的密码不一致',
    short: '密码至少 8 位',
    needServer: '请填写服务器地址',
    loading: '请稍候...',
    sameOrigin: '当前站点',
    change: '修改',
    footer: '与 DeepSeek 官方无关。对话直连 api.deepseek.com，服务器只存储同步数据，API Key 端到端加密。',
  },
  'en-US': {
    subtitle: 'Unofficial experimental build · bring your own DeepSeek API key',
    login: 'Log in',
    register: 'Sign up',
    username: 'Username',
    password: 'Password',
    passwordAgain: 'Confirm password',
    invite: 'Invite code',
    server: 'Server',
    serverHint: 'e.g. https://ds.example.com',
    toRegister: 'Have an invite code? Sign up',
    toLogin: 'Already have an account? Log in',
    mismatch: 'Passwords do not match',
    short: 'Password must be at least 8 characters',
    needServer: 'Please enter the server address',
    loading: 'Please wait...',
    sameOrigin: 'This site',
    change: 'Change',
    footer: 'Not affiliated with DeepSeek. Chats go directly to api.deepseek.com; the server only stores sync data, and your API key is end-to-end encrypted.',
  },
}

export const AuthScreen = () => {
  const locale = useSettings((state) => state.locale)
  const t = text[locale]
  const native = isNativeApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [invite, setInvite] = useState('')
  const [server, setServerInput] = useState(getServer)
  const [editingServer, setEditingServer] = useState(native && !getServer())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (native && !server.trim()) return setError(t.needServer)
    if (mode === 'register') {
      if (password.length < 8) return setError(t.short)
      if (password !== password2) return setError(t.mismatch)
    }
    setServer(server)
    setBusy(true)
    try {
      if (mode === 'login') await signIn(username.trim(), password)
      else await signUp(username.trim(), password, invite)
    } catch (err) {
      setError(err instanceof ServerError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={(event) => void submit(event)}>
        <div className={styles.brand}>
          <WhaleLogo size={44} withWordmark className={styles.logo} />
        </div>
        <div className={styles.subtitle}>{t.subtitle}</div>
        <div className={styles.tabs} role="tablist">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={clsx(styles.tab, mode === value && styles.tabActive)}
              onClick={() => {
                setMode(value)
                setError('')
              }}
            >
              {t[value]}
            </button>
          ))}
        </div>
        {editingServer ? (
          <input
            className={styles.input}
            placeholder={`${t.server}（${t.serverHint}）`}
            inputMode="url"
            autoCapitalize="off"
            value={server}
            onChange={(event) => setServerInput(event.target.value)}
          />
        ) : null}
        <input
          className={styles.input}
          placeholder={t.username}
          autoComplete="username"
          autoCapitalize="off"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <input
          className={styles.input}
          type="password"
          placeholder={t.password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {mode === 'register' ? (
          <>
            <input
              className={styles.input}
              type="password"
              placeholder={t.passwordAgain}
              autoComplete="new-password"
              value={password2}
              onChange={(event) => setPassword2(event.target.value)}
              required
            />
            <input
              className={styles.input}
              placeholder={t.invite}
              autoCapitalize="characters"
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              required
            />
          </>
        ) : null}
        {error ? <div className={styles.error}>{error}</div> : null}
        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? t.loading : t[mode]}
        </button>
        <div className={styles.meta}>
          <button
            type="button"
            className={styles.link}
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? t.toRegister : t.toLogin}
          </button>
          {!editingServer ? (
            <span className={styles.server}>
              {t.server}：{getServer() || t.sameOrigin}
              <button type="button" className={styles.link} onClick={() => setEditingServer(true)}>
                {t.change}
              </button>
            </span>
          ) : null}
        </div>
      </form>
      <div className={styles.footer}>{t.footer}</div>
    </div>
  )
}
