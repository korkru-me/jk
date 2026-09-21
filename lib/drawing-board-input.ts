export type FingerInputMode = 'finger_draw' | 'finger_pan'

export const DEFAULT_FINGER_INPUT_MODE: FingerInputMode = 'finger_draw'

export interface DrawingPointerRoutingState {
  /** Touch pointers currently owned by this editor surface. */
  readonly activeTouchPointerIds: readonly number[]
  /** The user's stable Excalidraw penMode before the first touch began. */
  readonly penModeBeforeTouch: boolean | null
  /** Whether this router pressed Space for a one-finger pan gesture. */
  readonly ownsSpacePan: boolean
}

export const INITIAL_DRAWING_POINTER_ROUTING_STATE: DrawingPointerRoutingState = {
  activeTouchPointerIds: [],
  penModeBeforeTouch: null,
  ownsSpacePan: false,
}

export interface DrawingPointerRoutingEffects {
  /** Set Excalidraw penMode to this value; null means leave it unchanged. */
  readonly penMode: boolean | null
  /** Synthetic Space ownership change; null means leave it unchanged. */
  readonly spacePan: 'press' | 'release' | null
}

export interface DrawingPointerRoutingResult {
  readonly state: DrawingPointerRoutingState
  readonly effects: DrawingPointerRoutingEffects
}

const NO_EFFECTS: DrawingPointerRoutingEffects = {
  penMode: null,
  spacePan: null,
}

/**
 * Describe the app-owned effects that must run before Excalidraw receives a
 * pointerdown. Mouse and stylus retain Excalidraw's native behavior. Touch
 * temporarily disables penMode so one finger can draw and two fingers can
 * pinch; finger-pan additionally borrows Excalidraw's standard Space-pan.
 */
export function routeDrawingPointerDown(
  state: DrawingPointerRoutingState,
  input: {
    pointerId: number
    pointerType: string
    fingerMode: FingerInputMode
    penMode: boolean
  },
): DrawingPointerRoutingResult {
  if (
    input.pointerType !== 'touch'
    || state.activeTouchPointerIds.includes(input.pointerId)
  ) {
    return { state, effects: NO_EFFECTS }
  }

  const firstTouch = state.activeTouchPointerIds.length === 0
  if (!firstTouch) {
    return {
      state: {
        ...state,
        activeTouchPointerIds: [...state.activeTouchPointerIds, input.pointerId],
      },
      effects: NO_EFFECTS,
    }
  }

  const ownsSpacePan = input.fingerMode === 'finger_pan'
  return {
    state: {
      activeTouchPointerIds: [input.pointerId],
      penModeBeforeTouch: input.penMode,
      ownsSpacePan,
    },
    effects: {
      penMode: input.penMode ? false : null,
      spacePan: ownsSpacePan ? 'press' : null,
    },
  }
}

/**
 * Describe pointerup/pointercancel cleanup. Stable penMode and synthetic Space
 * are restored only after the last tracked touch, so a two-finger gesture does
 * not lose pinch-zoom or pan when either finger lifts first.
 */
export function routeDrawingPointerEnd(
  state: DrawingPointerRoutingState,
  input: { pointerId: number; pointerType: string },
): DrawingPointerRoutingResult {
  if (
    input.pointerType !== 'touch'
    || !state.activeTouchPointerIds.includes(input.pointerId)
  ) {
    return { state, effects: NO_EFFECTS }
  }

  const activeTouchPointerIds = state.activeTouchPointerIds.filter(
    pointerId => pointerId !== input.pointerId,
  )
  if (activeTouchPointerIds.length > 0) {
    return {
      state: { ...state, activeTouchPointerIds },
      effects: NO_EFFECTS,
    }
  }

  return {
    state: INITIAL_DRAWING_POINTER_ROUTING_STATE,
    effects: {
      penMode: state.penModeBeforeTouch === true ? true : null,
      spacePan: state.ownsSpacePan ? 'release' : null,
    },
  }
}

/** Restore temporary editor state when routing is disabled or the surface unmounts. */
export function resetDrawingPointerRouting(
  state: DrawingPointerRoutingState,
): DrawingPointerRoutingResult {
  if (state.activeTouchPointerIds.length === 0) {
    return { state: INITIAL_DRAWING_POINTER_ROUTING_STATE, effects: NO_EFFECTS }
  }

  return {
    state: INITIAL_DRAWING_POINTER_ROUTING_STATE,
    effects: {
      penMode: state.penModeBeforeTouch === true ? true : null,
      spacePan: state.ownsSpacePan ? 'release' : null,
    },
  }
}
