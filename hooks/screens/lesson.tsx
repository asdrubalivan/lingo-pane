
import { ACTIVITIES, activityLabel, suggestActivity } from '../../src/activities'
import { LABELS } from '../../src/labels'
import { themeByName } from '../../src/themes'
import type { LingoActivity, LingoLesson, LingoSetup } from '../../types'
import { currentPaneData, focusKey, touch } from '../engine'
import { startActivity } from '../orchestration'
import { isReviewRunning } from '../review-session'
import { AVAILABLE_ACTIVITIES } from '../state'
import type { LessonContext, PaneContext } from './context'
import { drawReading } from './reading'
import { drawReview } from './review'
import { drawUnit } from './unit'

// The lesson, in the theme's colors; dim while the keys are elsewhere. The activity's tag
// and the switch menu are drawn here; the activity itself by its own screen.
export async function drawLesson(pane: PaneContext, setup: LingoSetup) {
  const { engine, ui, isFocused, top } = pane
  const { Box, Button, Text } = ui
  const theme = themeByName(setup.theme).colors
  const dim = !isFocused
  const current = await engine.lesson.read()
  const activityColor = theme[current.activity]
  const chip = (
    <Box columnGap={1}>
      <Text backgroundColor={activityColor} color={theme.bg} bold dimColor={dim}>
        {` ${activityLabel(current.activity)} · ${setup.level} `}
      </Text>
      {current.activity === 'roleplay' && current.unit?.scenario != null && (
        <Text color={theme.roleplay} dimColor={dim}>
          {current.unit.scenario.id === null ? LABELS.madeUpScenario(current.unit.scenario.title) : current.unit.scenario.title}
        </Text>
      )}
      {current.activity === 'reading' && current.reading !== null && current.reading.title !== '' && (
        <Text color={theme.reading} dimColor={dim}>
          {current.reading.title}
        </Text>
      )}
    </Box>
  )

  const openMenu = async () => {
    await touch(engine)
    await engine.lesson.update(l => ({ ...l, isMenuOpen: true }))
    await focusKey(engine, `switch-${current.activity}`)
  }
  const closeMenu = async () => {
    await touch(engine)
    await engine.lesson.update(l => ({ ...l, isMenuOpen: false }))
    const field =
      current.activity === 'review'
        ? `answer-${(await engine.practice.read()).index}`
        : current.activity === 'reading'
          ? 'reading-answer'
          : 'reply'
    await focusKey(engine, field)
  }
  // An activity left half done is resumed where it was; otherwise it starts.
  const choose = async (activity: LingoActivity) => {
    await touch(engine)
    const latest = await engine.lesson.read()
    const session = await engine.practice.read()
    const isRunning =
      activity === 'review'
        ? isReviewRunning(session)
        : activity === 'reading'
          ? latest.reading !== null && latest.reading.summary === null && latest.reading.text !== ''
          : latest.unit !== null && latest.unit.activity === activity && latest.unit.summary === null
    if (!isRunning) return startActivity(engine, setup, activity)
    await engine.lesson.update((l): LingoLesson => ({ ...l, activity, isMenuOpen: false }))
    await focusKey(engine, activity === 'review' ? `answer-${session.index}` : activity === 'reading' ? 'reading-answer' : 'reply')
  }
  const switchButton = <Button key="switch" label={LABELS.switchActivity} plain dimColor={dim} onPress={openMenu} />

  if (current.isMenuOpen) {
    const menu = ACTIVITIES.filter(a => AVAILABLE_ACTIVITIES.includes(a.id))
    return (
      <Box flexDirection="column">
        {top}
        {chip}
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={theme.ring} paddingX={1}>
          {menu.map((a, index) => (
            <Button
              key={`switch-${a.id}`}
              label={a.id === current.activity ? `${a.label} ${LABELS.current}` : a.label}
              hotkey={String(index + 1)}
              plain
              onPress={() => choose(a.id)}
            />
          ))}
          <Button key="switch-back" label={LABELS.backToField} plain dimColor onPress={closeMenu} />
        </Box>
        <Text color={theme.dim}>{LABELS.menuHint(menu.length)}</Text>
      </Box>
    )
  }

  const { log } = await currentPaneData(engine)
  const suggested = suggestActivity(log, AVAILABLE_ACTIVITIES)
  const nextButton = (
    <Button
      key="next-unit"
      label={LABELS.nextActivity(activityLabel(suggested))}
      variant="primary"
      autoFocus
      onPress={async () => {
        await touch(engine)
        await startActivity(engine, setup, suggested)
      }}
    />
  )

  const screen: LessonContext = { ...pane, setup, theme, dim, current, chip, nextButton, switchButton }

  if (current.activity === 'reading') return drawReading(screen)

  if (current.activity === 'review') {
    return (
      <Box flexDirection="column">
        {top}
        {chip}
        {await drawReview(screen)}
        <Box marginTop={1}>{switchButton}</Box>
      </Box>
    )
  }

  return drawUnit(screen, log)
}
