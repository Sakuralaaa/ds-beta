import { IconMenuOutline20, IconNewChatOutline20, IconShareOutline16 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import { shareSession } from '../../utils/share.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏（同官方手机网页版）：左侧菜单；右侧开启新对话，会话页另有分享 */
export const MobileHeader = ({ title, sessionId }: { title?: string; sessionId?: string }) => {
  const t = useTranslate()
  return (
    <div className={styles.header}>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      <div className={styles.title}>{title ?? ''}</div>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconNewChatOutline20 />}
        aria-label={t('newChat')}
        onClick={newChat}
      />
      {sessionId ? (
        <IconButton
          size="xl"
          tone="primary"
          icon={<IconShareOutline16 />}
          aria-label={t('share')}
          onClick={() => void shareSession(sessionId, title ?? '')}
        />
      ) : null}
    </div>
  )
}
