import { levelHint } from '../../src/activities'
import { isAwaitingLearner, markedParts, summaryText } from '../../src/conversation'
import { LABELS } from '../../src/labels'
import { listenUrl } from '../../src/listen'
import type { LingoActivityLog } from '../../types'
import { clearDraft, keepDraft, touch } from '../engine'
import { sendHelp, sendReply } from '../orchestration'
import type { LessonContext } from './context'
import { drawTypedEcho } from './echo'

// A conversation or role-play unit: the lines so far, the learner's field, and
// at the end the summary with the next activity one press away.
export function drawUnit(pane: LessonContext, log: LingoActivityLog) {
  const { engine, ui, isFocused, top, setup, theme, dim, current, chip, nextButton, switchButton } = pane
  const { Box, Input, Link, Text } = ui
  const unit = current.unit

  // Nothing in progress (a reset state): the suggested activity, one press away.
  if (unit === null) {
    return (
      <Box flexDirection="column">
        {top}
        {chip}
        <Box marginTop={1} columnGap={2}>
          {nextButton}
          {switchButton}
        </Box>
      </Box>
    )
  }

  // The draft belongs to this unit's reply: the field keeps its key from one unit to the next.
  const field = `reply:${unit.id}`
  const lastTutor = [...unit.lines].reverse().find(l => l.who === 'tutor')
  const found = unit.summary === null ? null : levelHint(log, setup.level)
  const hint = found === null ? null : LABELS.levelHint(found.direction, found.level)

  // Where a role-play happens and who plays whom, under the chip.
  const scene =
    current.activity === 'roleplay' && unit.scenario != null ? (
      <Text color={theme.dim} dimColor={dim} wrap="wrap">
        {LABELS.scene(unit.scenario.situation, unit.scenario.learnerRole)}
      </Text>
    ) : null

  return (
    <Box flexDirection="column">
      {top}
      {chip}
      {scene}
      <Box flexDirection="column" marginTop={1}>
        {unit.lines.map((line, index) =>
          line.who === 'tutor' ? (
            <Text key={`line-${index}`} color={theme.fg} dimColor={dim}>
              <Text color={theme.tutor} bold>
                {LABELS.tutor}
              </Text>
              {markedParts(line.text, line.mark).map(([part, isMark], at) =>
                isMark ? (
                  <Text key={`mark-${at}`} color={theme.err} underline>
                    {part}
                  </Text>
                ) : (
                  part
                ),
              )}
            </Text>
          ) : line.who === 'you' ? (
            <Text key={`line-${index}`} color={theme.fg} dimColor={dim}>
              <Text color={theme.you} bold>
                {LABELS.you}
              </Text>
              {line.text}
            </Text>
          ) : (
            <Text key={`line-${index}`} color={theme.dim} italic dimColor={dim}>
              {LABELS.help}
              {line.text}
            </Text>
          ),
        )}
        {unit.pending !== null && (
          <Text color={theme.dim} dimColor={dim}>
            {LABELS.tutorThinking}
          </Text>
        )}
        {unit.notice !== null && (
          <Text color={theme.err} dimColor={dim}>
            {unit.notice}
          </Text>
        )}
      </Box>

      {unit.summary === null ? (
        <Box flexDirection="column" marginTop={1}>
          <Box borderStyle="round" borderColor={isFocused ? theme.ring : theme.dim} paddingX={1}>
            <Input
              key="reply"
              placeholder={LABELS.replyPlaceholder(setup.targetLanguage)}
              submitLabel={LABELS.replySubmit}
              autoFocus
              onInput={async value => {
                await keepDraft(engine, field, value)
                await touch(engine)
              }}
              onSubmit={async value => {
                await clearDraft(engine)
                await touch(engine)
                if (value.trim() === '') return sendHelp(engine, setup)
                return sendReply(engine, setup, value)
              }}
            />
          </Box>
          {drawTypedEcho(pane, field, { submitLabel: LABELS.replySubmit, isBoxed: true }, { color: theme.you, dim })}
          <Box columnGap={2} flexWrap="wrap">
            {lastTutor !== undefined && (
              <Text color={theme.tutor} dimColor={dim}>
                <Link href={listenUrl(lastTutor.text, setup.targetLanguage, setup.nativeLanguage)}>{LABELS.listen}</Link>
              </Text>
            )}
            {switchButton}
          </Box>
          <Text color={theme.dim} dimColor={dim}>
            {isAwaitingLearner(unit) ? LABELS.talkHint : LABELS.talkHintWaiting}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.you} bold dimColor={dim}>
            {summaryText(unit.summary, unit.activity)}
          </Text>
          {hint !== null && (
            <Text color={theme.tutor} dimColor={dim}>
              {hint}
            </Text>
          )}
          <Box columnGap={2} marginTop={1}>
            {nextButton}
            {switchButton}
          </Box>
        </Box>
      )}
    </Box>
  )
}
