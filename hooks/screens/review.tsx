
import { markedParts } from '../../src/conversation'
import { LABELS } from '../../src/labels'
import { isFinished } from '../../src/lesson'
import { currentPaneData, touch } from '../engine'
import { advanceCard, askTutorHint, beginReview, cardLookup, leaveReview, reviewQueueOf, submitAnswer } from '../review-session'
import type { LessonContext } from './context'

// The review: the built-in pack, card by card. An empty Enter shows the answer
// (a miss); no letter hotkeys, since the field takes every printable key.
export async function drawReview({ engine, ui, isFocused, setup, strategies, theme, dim }: LessonContext) {
  const { pack } = strategies
  const { Box, Button, Input, Text } = ui
  const session = await engine.practice.read()
  const data = await currentPaneData(engine, strategies)
  const { progress, mistakes } = data
  const lookup = cardLookup(mistakes, strategies)
  const card = session.lesson === null ? undefined : lookup.cardOf(session.queue[session.index])
  const cardMistake = session.lesson === null ? undefined : lookup.mistakeOf(session.queue[session.index])
  const color = { color: theme.fg, dimColor: dim }

  // The store had no pack made for the pair: the learner is told which one they practise.
  const packNote = !pack.isForPair && (
    <Text color={theme.dim} dimColor={dim}>
      {LABELS.reviewPackNote(pack.title)}
    </Text>
  )

  if (session.lesson === null) {
    const finished = isFinished(progress, pack.lessonCount)
    const queue = reviewQueueOf(data, new Date(await engine.clock.now()), strategies)
    const isEmpty = queue.recall.length + queue.fresh.length === 0
    return (
      <Box flexDirection="column" marginTop={1}>
        {packNote}
        <Text {...color}>
          {isEmpty
            ? LABELS.reviewDemoFinished(pack.lessonCount)
            : finished
              ? LABELS.reviewMistakesIntro(queue.recall.length)
              : LABELS.reviewLessonIntro(progress.currentLesson, pack.lessonCount, queue.recall.length, queue.fresh.length)}
        </Text>
        {!isEmpty && <Button key="start" label={LABELS.reviewStart} variant="primary" autoFocus onPress={() => beginReview(engine, strategies)} />}
      </Box>
    )
  }

  if (session.status === 'done') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.you} bold dimColor={dim}>
          {session.lesson > pack.lessonCount ? LABELS.reviewDone : LABELS.reviewLessonDone(session.lesson)}
        </Text>
        {session.lesson >= pack.lessonCount && <Text {...color}>{LABELS.reviewDemoLast}</Text>}
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
              onInput={() => touch(engine)}
              onSubmit={value => submitAnswer(engine, lookup, value)}
            />
          </Box>
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
          <Button key="next" label={LABELS.next} variant="primary" autoFocus onPress={() => advanceCard(engine, strategies)} />
        </Box>
      )}
    </Box>
  )
}
