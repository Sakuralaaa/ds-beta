import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import { WhaleLogo } from '../brand/WhaleLogo.js'
import styles from './Welcome.module.css'

/** 新对话：问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  if (__DSX_APP__) {
    return (
      <div className={styles.container}>
        <MobileHeader />
        <div className={styles.appWelcome}>
          <WhaleLogo size={44} />
          <div className={styles.appGreeting}>{t('welcomeMessageMobile')}</div>
        </div>
        <div className={styles.appBottom}>
          <ChatInput sessionId={null} />
        </div>
      </div>
    )
  }
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting}>
          <WhaleLogo size={isMobile ? 28 : 36} className={styles.greetingLogo} />
          {t(isMobile ? 'welcomeMessageMobile' : 'welcomeMessageChat250808')}
        </div>
        <ChatInput sessionId={null} />
      </div>
    </div>
  )
}
