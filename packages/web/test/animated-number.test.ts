import { afterEach, expect, it, vi } from "vitest"
import { formatMoney } from "@fin/domain"
import { useAnimatedNumber } from "../index"

const animation = vi.hoisted(() => ({ values: Array<number>() }))

vi.mock("preact/hooks", () => ({
  useState: (initial: number) => [initial, (value: number) => animation.values.push(value)],
  useRef: (initial: number) => ({ current: initial }),
  useEffect: (effect: () => void) => effect()
}))

afterEach(() => {
  animation.values = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  { initial: 10_000, target: 12_000, hasKopecks: false },
  { initial: 12_000, target: 10_000, hasKopecks: false },
  { initial: 0, target: 12_000, hasKopecks: false },
  { initial: -10_000, target: 12_000, hasKopecks: false },
  { initial: 10_050, target: 12_000, hasKopecks: true },
  { initial: 10_000, target: 12_050, hasKopecks: true },
  { initial: 10_050, target: 12_025, hasKopecks: true }
])("показывает копейки только при дробном начале или конце: $initial → $target", ({ initial, target, hasKopecks }) => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) })
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame))
  vi.spyOn(performance, "now").mockReturnValue(0)

  useAnimatedNumber(target, 450, initial)
  for (let now = 0; now <= 450; now += 15) frames.shift()!(now)

  expect(animation.values.length).toBe(31)
  expect(animation.values.some((value) => formatMoney(value).includes(","))).toBe(hasKopecks)
  expect(animation.values.at(0)).toBe(initial)
  expect(animation.values.at(-1)).toBe(target)
})
