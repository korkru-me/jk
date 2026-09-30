import { describe, expect, it } from 'vitest'
import {
  boardPageTop,
  boardPaperHeight,
  BOARD_PAGE_GAP,
  BOARD_SHEET_HEIGHT,
  BOARD_SHEET_WIDTH,
  minimumBoardZoom,
} from '@/components/exam/drawing-board-utils'

describe('drawing board paper layout', () => {
  it('uses the board width as the minimum zoom', () => {
    expect(minimumBoardZoom(BOARD_SHEET_WIDTH)).toBe(1)
    expect(minimumBoardZoom(800)).toBe(0.5)
    expect(BOARD_SHEET_WIDTH * minimumBoardZoom(1234)).toBeCloseTo(1234)
  })

  it('stacks at most three fixed-height pages with a visible gap', () => {
    expect(boardPaperHeight(1)).toBe(BOARD_SHEET_HEIGHT)
    expect(boardPaperHeight(3)).toBe(BOARD_SHEET_HEIGHT * 3 + BOARD_PAGE_GAP * 2)
    expect(boardPaperHeight(99)).toBe(BOARD_SHEET_HEIGHT * 3 + BOARD_PAGE_GAP * 2)
    expect(boardPageTop(2)).toBe((BOARD_SHEET_HEIGHT + BOARD_PAGE_GAP) * 2)
  })
})
