const ERROR_ENDPOINT = '/api/system/webui_error';
const MAX_TEXT = 4000;
const RECENT_TTL_MS = 30000;
const recent = new Map();

function compactText(value, max = MAX_TEXT) {
  const text = value == null ? '' : String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function errorToPayload(error) {
  if (!error) return {};
  if (error instanceof Error) {
    return {
      name: compactText(error.name, 200),
      message: compactText(error.message),
      stack: compactText(error.stack || ''),
    };
  }
  if (typeof error === 'object') {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch (_err) {
      return { message: compactText(error) };
    }
  }
  return { message: compactText(error) };
}

function shouldSkip(key) {
  const now = Date.now();
  for (const [itemKey, timestamp] of recent.entries()) {
    if (now - timestamp > RECENT_TTL_MS) recent.delete(itemKey);
  }
  const previous = recent.get(key) || 0;
  if (now - previous < RECENT_TTL_MS) return true;
  recent.set(key, now);
  return false;
}

export function reportWebuiError(kind, error, context = {}) {
  const payload = {
    kind: compactText(kind || 'webui_error', 120),
    url: compactText(window.location?.href || '', 1000),
    user_agent: compactText(window.navigator?.userAgent || '', 1000),
    error: errorToPayload(error),
    context,
  };
  const key = `${payload.kind}:${payload.error?.message || payload.context?.path || ''}`;
  if (shouldSkip(key)) return;
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(ERROR_ENDPOINT, blob)) return;
    }
    fetch(ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (_err) {
    // Error reporting must never create another visible UI error.
  }
}

export function installGlobalErrorReporter() {
  if (window.__lulynxWebuiErrorReporterInstalled) return;
  window.__lulynxWebuiErrorReporterInstalled = true;
  window.addEventListener('error', (event) => {
    reportWebuiError('window_error', event.error || event.message, {
      message: compactText(event.message),
      filename: compactText(event.filename, 1000),
      lineno: event.lineno || 0,
      colno: event.colno || 0,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportWebuiError('unhandled_rejection', event.reason || 'Unhandled promise rejection');
  });
}
