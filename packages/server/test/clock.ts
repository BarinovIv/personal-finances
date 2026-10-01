import { Clock, Duration, Effect } from "effect"

/**
 * Часы внешней границы для больших скачков времени: просроченные таймеры пробуждаются один раз
 * уже в новом моменте, как после приостановки процесса. Малые шаги по-прежнему проверяются TestClock.
 */
export const jumpClock = Effect.gen(function* () {
  let now = yield* Clock.currentTimeMillis
  const sleepers = new Set<{ at: number; wake: () => void }>()
  const clock: Clock.Clock = {
    [Clock.ClockTypeId]: Clock.ClockTypeId,
    unsafeCurrentTimeMillis: () => now,
    unsafeCurrentTimeNanos: () => BigInt(now) * 1_000_000n,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    sleep: (duration) => Effect.async<void>((resume) => {
      const sleeper = { at: now + Duration.toMillis(duration), wake: () => resume(Effect.void) }
      sleepers.add(sleeper)
      return Effect.sync(() => { sleepers.delete(sleeper) })
    })
  }
  yield* Effect.withClockScoped(clock)
  const setTime = (instant: number) => Effect.gen(function* () {
    yield* Effect.yieldNow()
    now = instant
    for (const sleeper of [...sleepers]) {
      if (sleeper.at <= now) {
        sleepers.delete(sleeper)
        sleeper.wake()
      }
    }
    yield* Effect.yieldNow()
  })
  return {
    setTime,
    advance: (duration: Duration.DurationInput) => setTime(now + Duration.toMillis(Duration.decode(duration)))
  }
})
