type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

export function notifyUnauthorized() {
  listeners.forEach((listener) => listener());
}

export function subscribeUnauthorized(listener: UnauthorizedListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
