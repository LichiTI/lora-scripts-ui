// localStorage 读写包装。
// 这些函数不依赖 state，调用者负责将读出的值合并进 state、将 state 的值传入写入。

import { DRAFT_STORAGE_KEY, DELETED_TASK_IDS_STORAGE_KEY } from './constants.js';

export { DRAFT_STORAGE_KEY, DELETED_TASK_IDS_STORAGE_KEY };

/**
 * 从 localStorage 读取并解析 SDXL 草稿。
 * @returns {object | null} 解析后的配置 patch，或 null（不存在/解析失败）
 */
export function readDraftFromStorage() {
  const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!rawDraft) return null;
  try {
    const parsed = JSON.parse(rawDraft);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.warn('Failed to read local draft:', error);
    return null;
  }
}

/**
 * 将当前配置作为草稿写入 localStorage。
 * @param {object} config
 */
export function writeDraftToStorage(config) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    /* localStorage 满或被禁用时静默 */
  }
}

/**
 * 读取已删除的任务 ID 集合（用于本地伪删除，使后端历史同步时过滤掉已被用户删除的项）。
 * @returns {Set<string>}
 */
export function loadDeletedTaskIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(DELETED_TASK_IDS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []);
  } catch (error) {
    return new Set();
  }
}

/**
 * 将已删除 ID 集合写回 localStorage。
 * @param {Iterable<string>} ids
 */
export function persistDeletedTaskIds(ids) {
  try {
    const arr = Array.from(ids || []).filter(Boolean);
    localStorage.setItem(DELETED_TASK_IDS_STORAGE_KEY, JSON.stringify(arr));
  } catch (error) {
    /* ignore */
  }
}
