import { useEffect, useRef, useState } from "preact/hooks"

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/** Плавно переводит число от предыдущего значения к новому. */
export const useAnimatedNumber = (target: number, duration = 450, initial = target) => {
  const [value, setValue] = useState(initial)
  const valueRef = useRef(initial)
  useEffect(() => {
    valueRef.current = value
  })
  useEffect(() => {
    if (reducedMotion()) return setValue(target)
    const from = valueRef.current
    if (from === target) return
    const step = from % 100 === 0 && target % 100 === 0 ? 100 : 1
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round((from + (target - from) * easeOutCubic(t)) / step) * step)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}
