import { useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { selectSession } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Modal } from '../base/Modal.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './Sider.module.css'

/** 侧栏搜索：按标题过滤历史对话 */
export const SessionSearch = ({ sessions, onClose }: { sessions: SessionSummary[]; onClose: () => void }) => {
  const t = useTranslate()
  const [query, setQuery] = useState('')
  const result = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? sessions.filter((s) => (s.title || '').toLowerCase().includes(q)) : sessions
    return list.slice(0, 50)
  }, [query, sessions])
  return (
    <Modal title={t('searchSessions')} closable onClose={onClose} className={styles.searchDialog}>
      <input
        className={styles.searchInput}
        autoFocus
        placeholder={t('searchSessions')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.searchList}>
        {result.map((s) => (
          <button
            key={s.id}
            type="button"
            className={styles.searchItem}
            onClick={() => {
              selectSession(s.id)
              closeMobileSider()
              onClose()
            }}
          >
            <span className={styles.selectTitle}>{s.title || t('untitledChat')}</span>
            <span className={styles.searchDate}>{new Date(s.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
        {!result.length ? <div className={styles.searchEmpty}>{t('searchSessionsEmpty')}</div> : null}
      </div>
    </Modal>
  )
}
