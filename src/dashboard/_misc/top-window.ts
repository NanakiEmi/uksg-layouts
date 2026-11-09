/**
 * The parts of the dashboard's top window (outside the panel iframe) that the admin panels use.
 * Panels only work inside `/dashboard/`, so this is null if the page is opened on its own.
 */
export interface TopReplicant<T> {
  value: T | undefined;
  on(event: 'change', handler: (value: T) => void): void;
}

interface TopWindow {
  NodeCG?: {
    Replicant<T>(name: string, namespace: string): TopReplicant<T>;
  };
  socket?: {
    emit(event: string, ...args: unknown[]): void;
  };
}

export function topWindow(): TopWindow | null {
  return window.top as unknown as TopWindow | null;
}
