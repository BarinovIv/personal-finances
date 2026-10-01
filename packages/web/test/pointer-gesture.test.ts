import { describe, expect, it } from "vitest"
import { pointerGesture } from "../index"

describe("жест на ручке перестановки", () => {
  it("горизонтальное движение влево начинает свайп удаления", () => {
    expect(pointerGesture(-24, 2)).toBe("swipe")
  })

  it("вертикальное движение начинает перестановку", () => {
    expect(pointerGesture(2, 24)).toBe("reorder")
  })

  it("не принимает микродвижение за жест", () => {
    expect(pointerGesture(-4, 2)).toBe("pending")
  })
})
