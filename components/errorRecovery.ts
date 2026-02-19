export type ErrorDetails = {
  id: string;
  message: string;
  stack?: string;
  source?: string;
  timestamp: string;
  url: string;
};

const createErrorId = (): string =>
  `ERR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const stringifyUnknown = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const hardRefresh = (): void => {
  window.location.reload();
};

export const clearOfflineCache = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }
};

export const canClearOfflineCache = (): boolean =>
  'serviceWorker' in navigator || 'caches' in window;

export const createErrorDetails = (
  error: unknown,
  source?: string,
  fallbackMessage = 'Unknown application error'
): ErrorDetails => {
  const typedError = error instanceof Error ? error : undefined;

  return {
    id: createErrorId(),
    message: typedError?.message || stringifyUnknown(error) || fallbackMessage,
    stack: typedError?.stack,
    source,
    timestamp: new Date().toISOString(),
    url: window.location.href,
  };
};

export const formatDiagnostics = (details: ErrorDetails): string => {
  const sourceLine = details.source ? `Source: ${details.source}` : 'Source: unknown';
  const stackLine = details.stack ? `\nStack:\n${details.stack}` : '';

  return [
    'Application failure diagnostics',
    `Error ID: ${details.id}`,
    `Timestamp: ${details.timestamp}`,
    `URL: ${details.url}`,
    sourceLine,
    `Message: ${details.message}`,
  ].join('\n') + stackLine;
};
