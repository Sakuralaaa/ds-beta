import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useState } from 'react'
import {
  IconRefreshOutline16,
  IconShareOutline16,
  IconThumbDownFill16,
  IconThumbDownOutline16,
  IconThumbUpFill16,
  IconThumbUpOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { shareText } from '../../utils/share.js'
import { openContextMenu, openSelectText, useLongPress } from '../base/ContextMenu.js'
import { IconCopyOutline16, IconRefreshOutline16 as IconRegen, IconShareOutline16 as IconShareMenu } from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply } from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

const copy = (text: string) => void navigator.clipboard?.writeText(text)
const SELECT_ICON = <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 2.5v11M2 2.5h2M2 13.5h2M6.5 3h7M6.5 8h7M6.5 13h4" strokeLinecap="round" /></svg>
export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  const longPress = useLongPress((x, y) => {
    if (streaming || !copyText) return
    openContextMenu(x, y, [
      { key: 'copy', label: '复制', icon: <IconCopyOutline16 />, onSelect: () => copy(copyText) },
      { key: 'select', label: '选择文本', icon: SELECT_ICON, onSelect: () => openSelectText(copyText) },
      ...(busy || refused ? [] : [{ key: 'regen', label: '重新生成', icon: <IconRegen />, onSelect: () => { stopReadAloud(); regenerateReply(sessionId, message.id) } }]),
      ...(responseText ? [{ key: 'share', label: '分享', icon: <IconShareMenu />, onSelect: () => void shareText(responseText) }] : []),
    ])
  })
  return (
    <div className={styles.message} {...(__DSX_APP__ ? longPress : {})}>
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
        />
      )}
      {answer ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {copyText ? <CopyButton text={copyText} /> : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused}
              onClick={() => {
                stopReadAloud()
                regenerateReply(sessionId, message.id)
              }}
            />
            {responseText && !refused ? <FeedbackButtons messageId={message.id} /> : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            {responseText ? (
              <IconButton
                icon={<IconShareOutline16 />}
                tooltip={t('share')}
                tooltipPlacement="bottom"
                onClick={() => void shareText(responseText)}
              />
            ) : null}
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
})

const FEEDBACK_KEY = 'dsx:feedback'
const readFeedback = (): Record<string, 'up' | 'down'> => {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** 点赞/点踩：只在本机记录（官方会回传给服务端，这里不收集任何数据） */
const FeedbackButtons = ({ messageId }: { messageId: string }) => {
  const t = useTranslate()
  const [value, setValue] = useState<'up' | 'down' | undefined>(() => readFeedback()[messageId])
  const set = (next: 'up' | 'down') => {
    const all = readFeedback()
    const v = value === next ? undefined : next
    if (v) all[messageId] = v
    else delete all[messageId]
    try {
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all))
    } catch {
      // 忽略
    }
    setValue(v)
    if (v) showToast({ key: 'feedbackThanks' })
  }
  return (
    <>
      <IconButton
        icon={value === 'up' ? <IconThumbUpFill16 /> : <IconThumbUpOutline16 />}
        tooltip={t('like')}
        tooltipPlacement="bottom"
        onClick={() => set('up')}
      />
      <IconButton
        icon={value === 'down' ? <IconThumbDownFill16 /> : <IconThumbDownOutline16 />}
        tooltip={t('dislike')}
        tooltipPlacement="bottom"
        onClick={() => set('down')}
      />
    </>
  )
}
