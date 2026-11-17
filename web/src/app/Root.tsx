import { useEffect, useState } from 'react'
import { AdminPanel, ADMIN_HASH } from '../components/admin/AdminPanel.js'
import { checkSession, useAccount } from '../services/account/account.js'
import { AuthScreen } from '../components/auth/AuthScreen.js'
import { App } from './App.js'

/** ds-beta：未登录显示登录/注册页，登录后进入原版界面并启动同步 */
export const Root = () => {
  const status = useAccount((state) => state.status)
  const isAdmin = useAccount((state) => !!state.user?.isAdmin)
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    void checkSession()
  }, [])
  useEffect(() => {
    if (status === 'signedIn') {
      void import('../services/account/sync.js').then(({ startSync }) => startSync())
    }
  }, [status])
  if (status === 'checking') {
    return null
  }
  if (status !== 'signedIn') return <AuthScreen />
  return (
    <>
      <App />
      {isAdmin && hash === ADMIN_HASH ? <AdminPanel /> : null}
    </>
  )
}
