import { reportWebuiError } from './utils/errorReporter.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

export function formatApiMessage(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  if (Array.isArray(value)) {
    return value.map(formatApiMessage).filter(Boolean).join('; ');
  }

  for (const key of ['message', 'detail', 'error', 'reason']) {
    const text = formatApiMessage(value[key]);
    if (text) return text;
  }

  if (Array.isArray(value.errors) && value.errors.length) {
    const text = value.errors.map(formatApiMessage).filter(Boolean).join('; ');
    if (text) return text;
  }
  if (Array.isArray(value.issues) && value.issues.length) {
    const text = value.issues.map(formatApiMessage).filter(Boolean).join('; ');
    if (text) return text;
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: options.body ? JSON_HEADERS : undefined,
      ...options,
    });
  } catch (_networkError) {
    const error = new Error('无法连接到后端服务，请确认后端 (gui.py) 已启动。');
    reportWebuiError('api_network_error', error, { path, method: options.method || 'GET' });
    throw error;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    if (response.status === 502) {
      const error = new Error('后端服务未启动 (127.0.0.1:28000)，请先通过启动脚本或 gui.py 启动后端。');
      reportWebuiError('api_invalid_json', error, { path, status: response.status });
      throw error;
    }
    const error = new Error(`接口返回的 JSON 无效：${path}`);
    reportWebuiError('api_invalid_json', error, { path, status: response.status });
    throw error;
  }

  if (!response.ok) {
    const error = new Error(formatApiMessage(payload?.detail || payload?.message || payload) || `请求失败：${response.status}`);
    reportWebuiError('api_response_error', error, {
      path,
      status: response.status,
      payload,
    });
    throw error;
  }

  return payload;
}

export function postJson(path, data) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function syncLocalTaskHistoryRemoval(taskId) {
  const normalizedId = String(taskId || '');
  if (!normalizedId) return;
  try {
    const history = await request('/api/local/task_history');
    const tasks = Array.isArray(history?.data?.tasks) ? history.data.tasks : [];
    const filtered = tasks.filter((task) => String(task?.id || task?.task_id || '') !== normalizedId);
    if (filtered.length !== tasks.length) {
      await postJson('/api/local/task_history', { tasks: filtered });
    }
  } catch (_e) {
    // Local cache sync failure should not affect the authoritative backend mutation.
  }
}

export async function clearLocalTaskHistoryFile() {
  try {
    await request('/api/local/task_history', { method: 'DELETE' });
  } catch (_e) {
    // Ignore local cache cleanup failures.
  }
}
