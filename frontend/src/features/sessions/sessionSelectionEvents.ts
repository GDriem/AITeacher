const SESSION_SELECTION_EVENT = "ait:session-selection";

export function notifySessionSelection(sessionId: string | null) {
  window.dispatchEvent(new CustomEvent<string | null>(SESSION_SELECTION_EVENT, { detail: sessionId }));
}

export function subscribeToSessionSelection(listener: (sessionId: string | null) => void) {
  const handleSelection = (event: Event) => listener((event as CustomEvent<string | null>).detail);
  window.addEventListener(SESSION_SELECTION_EVENT, handleSelection);
  return () => window.removeEventListener(SESSION_SELECTION_EVENT, handleSelection);
}
