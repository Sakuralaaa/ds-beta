import { useEffect } from 'react'
import { checkSession, useAccount } from '../services/account/account.js'
import { AuthScreen } from '../components/auth/AuthScreen.js'
import { App } from './App.js'

/** ds-beta：未登录显示登录/注册页，登录后进入原版界面并启动同步 */
export const Root = () => {
  const status = useAccount((state) => state.status)
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
  return status === 'signedIn' ? <App /> : <AuthScreen />
}
