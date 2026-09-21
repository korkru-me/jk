import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINGER_INPUT_MODE,
  INITIAL_DRAWING_POINTER_ROUTING_STATE,
  resetDrawingPointerRouting,
  routeDrawingPointerDown,
  routeDrawingPointerEnd,
  type DrawingPointerRoutingState,
} from './drawing-board-input'

describe('drawing board input routing', () => {
  it('defaults a new editor route session to finger draw', () => {
    expect(DEFAULT_FINGER_INPUT_MODE).toBe('finger_draw')
  })

  it.each(['mouse', 'pen'])('%s follows the active tool without app-owned effects', pointerType => {
    const state: DrawingPointerRoutingState = INITIAL_DRAWING_POINTER_ROUTING_STATE

    const down = routeDrawingPointerDown(state, {
      pointerId: 1,
      pointerType,
      fingerMode: 'finger_pan',
      penMode: true,
    })
    const end = routeDrawingPointerEnd(down.state, { pointerId: 1, pointerType })

    expect(down).toEqual({
      state,
      effects: { penMode: null, spacePan: null },
    })
    expect(end).toEqual({
      state,
      effects: { penMode: null, spacePan: null },
    })
  })

  it('suppresses penMode for a finger-draw gesture without borrowing Space', () => {
    const down = routeDrawingPointerDown(INITIAL_DRAWING_POINTER_ROUTING_STATE, {
      pointerId: 11,
      pointerType: 'touch',
      fingerMode: 'finger_draw',
      penMode: true,
    })

    expect(down).toEqual({
      state: {
        activeTouchPointerIds: [11],
        penModeBeforeTouch: true,
        ownsSpacePan: false,
      },
      effects: { penMode: false, spacePan: null },
    })
  })

  it('borrows Space only for a finger-pan gesture', () => {
    const draw = routeDrawingPointerDown(INITIAL_DRAWING_POINTER_ROUTING_STATE, {
      pointerId: 1,
      pointerType: 'touch',
      fingerMode: 'finger_draw',
      penMode: false,
    })
    const pan = routeDrawingPointerDown(INITIAL_DRAWING_POINTER_ROUTING_STATE, {
      pointerId: 2,
      pointerType: 'touch',
      fingerMode: 'finger_pan',
      penMode: false,
    })

    expect(draw.effects).toEqual({ penMode: null, spacePan: null })
    expect(draw.state.ownsSpacePan).toBe(false)
    expect(pan.effects).toEqual({ penMode: null, spacePan: 'press' })
    expect(pan.state.ownsSpacePan).toBe(true)
  })

  it('keeps penMode suppressed and Space owned across a second touch', () => {
    const first = routeDrawingPointerDown(INITIAL_DRAWING_POINTER_ROUTING_STATE, {
      pointerId: 21,
      pointerType: 'touch',
      fingerMode: 'finger_pan',
      penMode: true,
    })
    const second = routeDrawingPointerDown(first.state, {
      pointerId: 22,
      pointerType: 'touch',
      fingerMode: 'finger_pan',
      penMode: false,
    })

    expect(second).toEqual({
      state: {
        activeTouchPointerIds: [21, 22],
        penModeBeforeTouch: true,
        ownsSpacePan: true,
      },
      effects: { penMode: null, spacePan: null },
    })
  })

  it('restores and releases only after the final touch ends', () => {
    const active: DrawingPointerRoutingState = {
      activeTouchPointerIds: [31, 32],
      penModeBeforeTouch: true,
      ownsSpacePan: true,
    }

    const oneLeft = routeDrawingPointerEnd(active, {
      pointerId: 31,
      pointerType: 'touch',
    })
    const allEnded = routeDrawingPointerEnd(oneLeft.state, {
      pointerId: 32,
      pointerType: 'touch',
    })

    expect(oneLeft).toEqual({
      state: {
        activeTouchPointerIds: [32],
        penModeBeforeTouch: true,
        ownsSpacePan: true,
      },
      effects: { penMode: null, spacePan: null },
    })
    expect(allEnded).toEqual({
      state: INITIAL_DRAWING_POINTER_ROUTING_STATE,
      effects: { penMode: true, spacePan: 'release' },
    })
  })

  it('does not write penMode back when it was already disabled', () => {
    const down = routeDrawingPointerDown(INITIAL_DRAWING_POINTER_ROUTING_STATE, {
      pointerId: 41,
      pointerType: 'touch',
      fingerMode: 'finger_draw',
      penMode: false,
    })
    const end = routeDrawingPointerEnd(down.state, {
      pointerId: 41,
      pointerType: 'touch',
    })

    expect(end).toEqual({
      state: INITIAL_DRAWING_POINTER_ROUTING_STATE,
      effects: { penMode: null, spacePan: null },
    })
  })

  it('ignores duplicate downs and ends for touches this surface does not own', () => {
    const active: DrawingPointerRoutingState = {
      activeTouchPointerIds: [51],
      penModeBeforeTouch: true,
      ownsSpacePan: true,
    }

    expect(routeDrawingPointerDown(active, {
      pointerId: 51,
      pointerType: 'touch',
      fingerMode: 'finger_pan',
      penMode: false,
    })).toEqual({
      state: active,
      effects: { penMode: null, spacePan: null },
    })
    expect(routeDrawingPointerEnd(active, {
      pointerId: 999,
      pointerType: 'touch',
    })).toEqual({
      state: active,
      effects: { penMode: null, spacePan: null },
    })
  })

  it('restores temporary pen and Space state when routing stops mid-gesture', () => {
    const active: DrawingPointerRoutingState = {
      activeTouchPointerIds: [61, 62],
      penModeBeforeTouch: true,
      ownsSpacePan: true,
    }

    expect(resetDrawingPointerRouting(active)).toEqual({
      state: INITIAL_DRAWING_POINTER_ROUTING_STATE,
      effects: { penMode: true, spacePan: 'release' },
    })
    expect(resetDrawingPointerRouting(INITIAL_DRAWING_POINTER_ROUTING_STATE)).toEqual({
      state: INITIAL_DRAWING_POINTER_ROUTING_STATE,
      effects: { penMode: null, spacePan: null },
    })
  })
})
