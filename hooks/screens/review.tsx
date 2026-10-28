
import { DEMO_LESSON_COUNT, DEMO_PACK_TITLE } from '../../src/content/demo-english-a1'
import { markedParts } from '../../src/conversation'
import { LABELS } from '../../src/labels'
import { isFinished } from '../../src/lesson'
import { clearDraft, currentPaneData, keepDraft, touch } from '../engine'
import { advanceCard, askTutorHint, beginReview, cardLookup, leaveReview, reviewQueueOf, submitAnswer } from '../review-session'
import type { LessonContext } from './context'
import { drawTypedEcho } from './echo'

// The review: the built-in pack, card by card. An empty Enter shows the answer
// (a miss); no letter hotkeys, since the field takes every printable key.
export async function drawReview(pane: LessonContext) {
  const { engine, ui, isFocused, setup, theme, dim } = pane
  const { Box, Button, Input, Text } = ui
  const session = await engine.practice.read()
  const data = await currentPaneData(engine)
  const { progress, mistakes } = data
  const lookup = cardLookup(mistakes)
  const card = session.lesson === null ? undefined : lookup.cardOf(session.queue[session.index])
  const cardMistake = session.lesson === null ? undefined : lookup.mistakeOf(session.queue[session.index])
  const color = { color: theme.fg, dimColor: dim }

  const isDemoPair = setup.targetLanguage.toLowerCase() === 'english' && setup.nativeLanguage.toLowerCase() === 'spanish'
  const packNote = !isDemoPair && (
    <Text color={theme.dim} dimColor={dim}>
      {LABELS.reviewPackNote(DEMO_PACK_TITLE)}
    </Text>
  )

  if (session.lesson === null) {
    const finished = isFinished(progress, DEMO_LESSON_COUNT)
    const queue = reviewQueueOf(data, new Date(await engine.clock.now()))
    const isEmpty = queue.recall.length + queue.fresh.length === 0
    return (
      <Box flexDirection="column" marginTop={1}>
        {packNote}
        <Text {...color}>
          {isEmpty
            ? LABELS.reviewDemoFinished(DEMO_LESSON_COUNT)
            : finished
              ? LABELS.reviewMistakesIntro(queue.recall.length)
              : LABELS.reviewLessonIntro(progress.currentLesson, DEMO_LESSON_COUNT, queue.recall.length, queue.fresh.length)}
        </Text>
        {!isEmpty && <Button key="start" label={LABELS.reviewStart} variant="primary" autoFocus onPress={() => beginReview(engine)} />}
      </Box>
    )
  }

  if (session.status === 'done') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.you} bold dimColor={dim}>
          {session.lesson > DEMO_LESSON_COUNT ? LABELS.reviewDone : LABELS.reviewLessonDone(session.lesson)}
        </Text>
        {session.lesson >= DEMO_LESSON_COUNT && <Text {...color}>{LABELS.reviewDemoLast}</Text>}
        <Button
          key="continue"
          label={LABELS.reviewContinue}
          variant="primary"
          autoFocus
          onPress={() => leaveReview(engine)}
        />
      </Box>
    )
  }

  const isRecall = session.index < session.recallCount
  // The draft belongs to this card of this lesson, so it never follows the learner to another.
  const field = `answer-${session.lesson}-${session.index}`
  return (
    <Box flexDirection="column" marginTop={1}>
      {packNote}
      <Text color={theme.dim} dimColor={dim}>
        {cardMistake !== undefined
          ? LABELS.reviewMistakeOf(session.index + 1, session.queue.length)
          : LABELS.reviewCardOf(session.lesson, session.index + 1, session.queue.length, isRecall)}
      </Text>
      {cardMistake === undefined ? (
        <Text color={theme.fg} bold dimColor={dim}>
          {card?.prompt ?? '?'}
        </Text>
      ) : (
        // The learner's own line, the wrong words marked: type the right ones.
        <Text color={theme.fg} bold dimColor={dim}>
          {markedParts(cardMistake.sentence, cardMistake.wrong).map(([part, isMark], at) =>
            isMark ? (
              <Text key={`mark-${at}`} color={theme.err} underline>
                {part}
              </Text>
            ) : (
              part
            ),
          )}
        </Text>
      )}
      {cardMistake !== undefined && session.status === 'revealed' && cardMistake.note !== '' && (
        <Text color={theme.dim} dimColor={dim}>
          {cardMistake.note}
        </Text>
      )}

      {session.status === 'asking' && (
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor={isFocused ? theme.ring : theme.dim} paddingX={1}>
            <Input
              key={`answer-${session.index}`}
              label={LABELS.reviewIn(setup.targetLanguage)}
              placeholder={LABELS.reviewPlaceholder}
              submitLabel={LABELS.reviewSubmit}
              autoFocus
              onInput={async value => {
                await keepDraft(engine, field, value)
                await touch(engine)
              }}
              onSubmit={async value => {
                await clearDraft(engine)
                await submitAnswer(engine, lookup, value)
              }}
            />
          </Box>
          {drawTypedEcho(
            pane,
            field,
            { label: LABELS.reviewIn(setup.targetLanguage), submitLabel: LABELS.reviewSubmit, isBoxed: true },
            { color: theme.you, dim },
          )}
          {session.hint !== null && (
            <Text color={theme.err} dimColor={dim}>
              {LABELS.reviewNotYet(session.hint)}
            </Text>
          )}
          <Box columnGap={2}>
            <Button key="tutor" label={LABELS.reviewHintFromTutor} plain dimColor={dim} onPress={() => askTutorHint(engine, setup, lookup)} />
          </Box>
          {session.tutor.kind === 'loading' && <Text color={theme.dim}>{LABELS.tutorThinking}</Text>}
          {session.tutor.kind === 'answered' && (
            <Text color={theme.fg} dimColor={dim}>
              <Text color={theme.tutor} bold>
                {LABELS.tutor}
              </Text>
              {session.tutor.text}
            </Text>
          )}
          {session.tutor.kind === 'unavailable' && <Text color={theme.dim}>{session.tutor.text}</Text>}
          <Text color={theme.dim} dimColor={dim}>
            {LABELS.reviewHint}
          </Text>
        </Box>
      )}

      {session.status !== 'asking' && (
        <Box flexDirection="column">
          {session.status === 'correct' ? (
            <Text color={theme.you} bold dimColor={dim}>
              {LABELS.reviewCorrect(card?.answer ?? '')}
            </Text>
          ) : (
            <Text {...color}>{LABELS.reviewAnswer(card?.answer ?? '')}</Text>
          )}
          <Button key="next" label={LABELS.next} variant="primary" autoFocus onPress={() => advanceCard(engine)} />
        </Box>
      )}
    </Box>
  )
}
