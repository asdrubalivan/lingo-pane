import { LABELS } from '../../src/labels'
import { listenUrl } from '../../src/listen'
import { summaryText } from '../../src/conversation'
import { answerQuestion } from '../orchestration'
import { clearDraft, keepDraft, touch } from '../engine'
import type { LessonContext } from './context'
import { drawEcho, draftOf } from './echo'

// A reading: the text, then one question at a time. An empty Enter shows the
// answer and makes a card of the question.
export function drawReading(pane: LessonContext) {
  const { engine, ui, isFocused, top, setup, theme, dim, current, chip, nextButton, switchButton } = pane
  const { Box, Input, Link, Text } = ui
  const reading = current.reading
  const question = reading?.questions[reading.index]
  return (
    <Box flexDirection="column">
      {top}
      {chip}
      {reading === null || reading.isPending ? (
        <Text color={theme.dim} dimColor={dim}>
          {LABELS.readingWriting}
        </Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {reading.text !== '' && (
            <Text color={theme.fg} dimColor={dim} wrap="wrap">
              {reading.text}
            </Text>
          )}
          {reading.text !== '' && (
            <Text color={theme.dim} dimColor={dim}>
              {LABELS.readingGenerated}
            </Text>
          )}
          {reading.questions.slice(0, reading.index).map((q, at) => (
            <Text key={`answered-${at}`} color={q.outcome === 'right' ? theme.you : theme.err} dimColor={dim}>
              {LABELS.readingAnswered(at + 1, q.question, q.answer, q.outcome === 'right')}
            </Text>
          ))}
          {question !== undefined && reading.summary === null && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.fg} bold dimColor={dim}>
                {LABELS.readingQuestion(reading.index + 1, reading.questions.length, question.question)}
              </Text>
              <Box borderStyle="round" borderColor={isFocused ? theme.ring : theme.dim} paddingX={1}>
                <Input
                  key="reading-answer"
                  placeholder={LABELS.readingPlaceholder}
                  submitLabel={LABELS.reviewSubmit}
                  autoFocus
                  onInput={async value => {
                    await touch(engine)
                    await keepDraft(engine, 'reading-answer', value)
                  }}
                  onSubmit={async value => {
                    await touch(engine)
                    await clearDraft(engine)
                    await answerQuestion(engine, value)
                  }}
                />
              </Box>
              {drawEcho(
                pane,
                'reading-answer',
                draftOf(pane.draft, 'reading-answer'),
                { submitLabel: LABELS.reviewSubmit, isBoxed: true },
                { color: theme.you, dim },
              )}
              {reading.misses > 0 && (
                <Text color={theme.err} dimColor={dim}>
                  {LABELS.readingNotQuite}
                </Text>
              )}
            </Box>
          )}
          {reading.notice !== null && (
            <Text color={theme.err} dimColor={dim}>
              {reading.notice}
            </Text>
          )}
          {reading.summary !== null && (
            <Text color={theme.you} bold dimColor={dim}>
              {summaryText(reading.summary, 'reading')}
            </Text>
          )}
        </Box>
      )}
      <Box columnGap={2} marginTop={1} flexWrap="wrap">
        {reading !== null && (reading.summary !== null || (reading.notice !== null && reading.text === '')) && nextButton}
        {reading !== null && reading.text !== '' && (
          <Text color={theme.tutor} dimColor={dim}>
            <Link href={listenUrl(reading.text, setup.targetLanguage, setup.nativeLanguage)}>{LABELS.listen}</Link>
          </Text>
        )}
        {switchButton}
      </Box>
      {question !== undefined && reading?.summary === null && (
        <Text color={theme.dim} dimColor={dim}>
          {LABELS.readingHint}
        </Text>
      )}
    </Box>
  )
}
