import { createContext, useContext, type PointerEvent } from 'react';
import type { XYPosition } from '@xyflow/react';

/** A transition whose arrow end is being dragged to another screen or state. */
export interface Reconnecting {
  transitionId: string;
  /** The pointer, in canvas coordinates. */
  at: XYPosition;
}

export interface Reconnect {
  reconnecting: Reconnecting | null;
  /** Starts dragging a transition's arrow end, from a pointer press on its grip. */
  start: (transitionId: string, event: PointerEvent) => void;
}

export const ReconnectContext = createContext<Reconnect>({
  reconnecting: null,
  start: () => {},
});

export const useReconnect = () => useContext(ReconnectContext);
