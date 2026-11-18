import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconCloseOutline16,
  IconDownloadOutline16,
  IconEllipsisOutline16,
  IconLogoutOutline16,
  IconMultiSelectOutline16,
  IconPanelLeftOutline16,
  IconPinOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  IconShieldOutline16,
  IconTrashOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { Menu } from '../base/Menu.js'
import { SessionSearch } from './SessionSearch.js'
import { setSiderCollapsed, togglePinned, useSettings } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { signOut, useAccount } from '../../services/account/account.js'
import { openAdmin } from '../admin/AdminPanel.js'
import { closeMobileSider, openMobileSider, useMobileSider } from './mobileSiderState.js'
import { useBackHandler } from '../../services/app/back.js'
import { SessionItem } from './SessionItem.js'
import { WhaleLogo } from '../brand/WhaleLogo.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const user = useAccount((state) => state.user)
  const isAdmin = !!user?.isAdmin
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState(false)
  useBackHandler(selecting, () => setSelecting(false))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const [now, setNow] = useState(Date.now)
  const pinned = useSettings((state) => state.pinned)
  const groups = useMemo(() => groupSessions(sessions, now, t, pinned), [sessions, now, t, pinned])
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      {__DSX_APP__ && !selecting ? (
        <button type="button" className={styles.appSearch} onClick={() => setSearching(true)}>
          <IconSearchOutline16 />
          <span>搜索对话内容...</span>
        </button>
      ) : null}
      <div className={styles.top} hidden={__DSX_APP__ && !selecting}>
        <div className={styles.appName}>
          <WhaleLogo size={28} withWordmark />
        </div>
        <div className={styles.topSpacer} />
        {selecting ? null : (
          <IconButton
            size="m"
            icon={<IconSearchOutline16 />}
            tooltip={t('searchSessions')}
            tooltipPlacement="bottom"
            onClick={() => setSearching(true)}
          />
        )}
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      {selecting ? (
        <div className={styles.selectHeader}>
          <span>{t('selectSessions')}</span>
          <button type="button" className={styles.selectClose} aria-label={t('cancel')} onClick={exitSelect}>
            <IconCloseOutline16 />
          </button>
        </div>
      ) : __DSX_APP__ ? null : (
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      )}
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map((group, index) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>
                {group.label}
                {index === 0 && !selecting ? (
                  <IconButton
                    icon={<IconMultiSelectOutline16 />}
                    tooltip={t('batchManage')}
                    tooltipPlacement="bottom"
                    className={styles.sectionAction}
                    onClick={() => setSelecting(true)}
                  />
                ) : null}
              </div>
              {group.sessions.map((session) =>
                selecting ? (
                  <button
                    key={session.id}
                    type="button"
                    className={clsx(styles.selectItem, selected.has(session.id) && styles.selectItemOn)}
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(session.id)) next.delete(session.id)
                        else next.add(session.id)
                        return next
                      })
                    }
                  >
                    <span className={styles.checkbox} />
                    <span className={styles.selectTitle}>{session.title || t('untitledChat')}</span>
                  </button>
                ) : (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  pinned={pinned.includes(session.id)}
                  onDelete={() => setDeleting(session)}
                  onMultiSelect={() => {
                    setSelecting(true)
                    setSelected(new Set([session.id]))
                  }}
                />
                )
              )}
            </div>
          ))}
        </div>
      </div>
      {selecting ? (
        <div className={styles.selectBar}>
          <button
            type="button"
            className={styles.selectBarButton}
            disabled={!selected.size}
            onClick={() => {
              togglePinned([...selected])
              exitSelect()
            }}
          >
            <IconPinOutline16 />
            {[...selected].length && [...selected].every((id) => pinned.includes(id)) ? t('unpin') : t('pin')}
          </button>
          <span className={styles.selectBarDivider} />
          <button
            type="button"
            className={styles.selectBarButton}
            disabled={!selected.size}
            onClick={() => setBatchDeleting(true)}
          >
            <IconTrashOutline16 />
            {t('delete')}
          </button>
        </div>
      ) : (
        <div className={styles.bottom}>
          <Menu
            options={[
              ...(isAdmin
                ? [{ key: 'admin', label: t('menuAdmin'), icon: <IconShieldOutline16 />, onSelect: () => { closeMobileSider(); openAdmin() } }]
                : []),
              ...(__DSX_APP__
                ? []
                : [{ key: 'app', label: t('menuDownloadApp'), icon: <IconDownloadOutline16 />, onSelect: () => { window.location.href = '/api/app/download' } }]),
              { key: 'settings', label: t('systemSettings'), icon: <IconSettingsOutline16 />, onSelect: () => openSettings('general') },
              { key: 'logout', label: t('menuLogout'), icon: <IconLogoutOutline16 />, onSelect: () => void signOut() },
            ]}
          >
            {({ open, toggle }) => (
              <button type="button" className={clsx(styles.userRow, open && styles.userRowOpen)} onClick={toggle}>
                <span className={styles.avatar}>{(user?.username ?? '?').slice(0, 1).toUpperCase()}</span>
                <span className={styles.userName}>{user?.username}</span>
                <span className={styles.userMore}>
                  <IconEllipsisOutline16 />
                </span>
              </button>
            )}
          </Menu>
        </div>
      )}
      {searching ? <SessionSearch sessions={sessions} onClose={() => setSearching(false)} /> : null}
      {batchDeleting ? (
        <Modal
          title={t('deleteSelectedTitle', { count: selected.size })}
          onClose={() => !deletePending && setBatchDeleting(false)}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setBatchDeleting(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    for (const id of selected) {
                      if (!(await removeSession(id))) showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                    setBatchDeleting(false)
                    exitSelect()
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  useBackHandler(open, closeMobileSider)
  if (__DSX_APP__) return <AppDrawer open={open} />
  if (!open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} onClick={closeMobileSider} />
      <div className={styles.drawer}>
        <Sider mobile />
      </div>
    </>
  )
}

/** APK：抽屉常驻，滑入/滑出动画 + 遮罩渐变；左边缘右滑打开、抽屉上左滑关闭 */
const AppDrawer = ({ open }: { open: boolean }) => {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  useEffect(() => {
    let start: { x: number; y: number; open: boolean } | null = null
    let dx = 0
    let decided: boolean | null = null
    const width = () => drawerRef.current?.offsetWidth ?? 300
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      const isOpen = useMobileSider.getState().open
      if (!isOpen && t.clientX > 24) return
      start = { x: t.clientX, y: t.clientY, open: isOpen }
      dx = 0
      decided = null
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (decided === null && Math.hypot(dx, dy) > 8) decided = Math.abs(dx) > Math.abs(dy)
      if (!decided) return
      const w = width()
      const offset = start.open ? Math.min(0, dx) : Math.min(0, dx - w)
      setDrag(Math.max(-w, offset))
    }
    const onEnd = () => {
      if (start && decided) {
        const w = width()
        if (start.open && dx < -w / 4) closeMobileSider()
        else if (!start.open && dx > w / 4) openMobileSider()
      }
      start = null
      setDrag(null)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [])
  const w = drawerRef.current?.offsetWidth ?? 300
  const progress = drag !== null ? 1 + drag / w : open ? 1 : 0
  return (
    <>
      <div
        className={styles.appMask}
        style={{ opacity: progress * 0.5, pointerEvents: open ? 'auto' : 'none', transition: drag !== null ? 'none' : undefined }}
        onClick={closeMobileSider}
      />
      <div
        ref={drawerRef}
        className={styles.appDrawer}
        style={{
          transform: `translateX(${drag !== null ? drag : open ? 0 : -w - 8}px)`,
          transition: drag !== null ? 'none' : undefined,
          visibility: progress > 0 || drag !== null ? 'visible' : 'hidden',
        }}
      >
        <Sider mobile />
      </div>
    </>
  )
}
