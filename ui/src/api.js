const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: options.body ? JSON_HEADERS : undefined,
      ...options,
    });
  } catch (networkError) {
    throw new Error('无法连接到后端服务，请确认后端 (gui.py) 已启动。');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    if (response.status === 502) {
      throw new Error('后端服务未启动 (127.0.0.1:28000)，请先通过启动脚本或 gui.py 启动后端。');
    }
    throw new Error(`接口返回的 JSON 无效：${path}`);
  }

  if (!response.ok) {
    throw new Error(payload?.message || `请求失败：${response.status}`);
  }

  return payload;
}

function postJson(path, data) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export const api = {
  getGraphicCards() {
    return request('/api/graphic_cards');
  },

  getPresets() {
    return request('/api/presets');
  },

  getSavedParams() {
    return request('/api/config/saved_params');
  },

  getTasks() {
    return request('/api/tasks');
  },

  terminateTask(taskId) {
    return request(`/api/tasks/terminate/${taskId}`);
  },

  deleteTask(taskId) {
    return request(`/api/tasks/${taskId}`, { method: 'DELETE' });
  },

  deleteAllTasks() {
    return request('/api/tasks', { method: 'DELETE' });
  },

  deleteLocalTaskHistory(taskId) {
    return request(`/api/local/task_history/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  },

  pickFile(type) {
    return request(`/api/pick_file?picker_type=${encodeURIComponent(type)}`);
  },

  getBuiltinPicker(type) {
    // Map to the original /api/get_files endpoint (no backend changes needed)
    var getFilesMap = {
      'model-file': 'model-file',
      'output-model-file': 'model-saved-file',
      'folder': 'train-dir',
      'text-file': 'model-file',
    };

    // output-folder 特殊处理：后端没有“output目录列表”预设，
    // 用 model-saved-file 扫描 ./output 文件，提取去重的父文件夹作为选项
    if (type === 'output-folder') {
      return request('/api/get_files?pick_type=model-saved-file').then(function(resp) {
        var files = (resp && resp.data && resp.data.files) || [];
        if (files.length === 0) {
          return { status: 'success', data: { rootLabel: './output', items: [] } };
        }
        var paths = files.map(function(f) { return (f.path || '').replaceAll('\\', '/'); });
        // 计算公共根目录
        var rootLabel = paths.reduce(function(a, b) {
          while (b.indexOf(a + '/') !== 0 && a) a = a.substring(0, a.lastIndexOf('/'));
          return a;
        });
        var prefix = rootLabel ? rootLabel + '/' : '';
        // 从文件路径提取父文件夹，去重
        var folderSet = new Set();
        files.forEach(function(f) {
          var p = (f.path || '').replaceAll('\\', '/');
          var rel = prefix && p.indexOf(prefix) === 0 ? p.substring(prefix.length) : f.name;
          var slashIdx = rel.indexOf('/');
          if (slashIdx > 0) {
            folderSet.add(rel.substring(0, slashIdx));
          }
        });
        // 如果没有子文件夹，直接返回文件列表（允许选择文件旁的状态目录）
        var items = folderSet.size > 0
          ? Array.from(folderSet).sort()
          : files.map(function(f) {
              var p = (f.path || '').replaceAll('\\', '/');
              return prefix && p.indexOf(prefix) === 0 ? p.substring(prefix.length) : f.name;
            });
        return { status: 'success', data: { rootLabel: rootLabel, items: items } };
      });
    }

    var mapped = getFilesMap[type];
    if (!mapped) {
      return request('/api/builtin_picker?picker_type=' + encodeURIComponent(type));
    }
    return request('/api/get_files?pick_type=' + encodeURIComponent(mapped)).then(function(resp) {
      var files = (resp && resp.data && resp.data.files) || [];
      var rootLabel = '';
      if (files.length > 0) {
        var paths = files.map(function(f) { return (f.path || '').replaceAll('\\', '/'); });
        rootLabel = paths.reduce(function(a, b) {
          while (b.indexOf(a + '/') !== 0 && a) a = a.substring(0, a.lastIndexOf('/'));
          return a;
        });
      }
      var prefix = rootLabel ? rootLabel + '/' : '';
      var items = files.map(function(f) {
        var p = (f.path || '').replaceAll('\\', '/');
        return prefix && p.indexOf(prefix) === 0 ? p.substring(prefix.length) : f.name;
      });
      return { status: 'success', data: { rootLabel: rootLabel, items: items } };
    });
  },


  saveConfig(name, config) {
    return postJson('/api/saved_configs/save', { name, config });
  },

  listSavedConfigs() {
    return request('/api/saved_configs/list');
  },

  loadSavedConfig(name) {
    return request(`/api/saved_configs/load?name=${encodeURIComponent(name)}`);
  },

  deleteSavedConfig(name) {
    return request(`/api/saved_configs/delete?name=${encodeURIComponent(name)}`);
  },

  renameSavedConfig(oldName, newName) {
    return postJson('/api/saved_configs/rename', { oldName, newName });
  },


  runScript(params) {
    return postJson('/api/run_script', params);
  },

  runPreflight(config) {
    return postJson('/api/train/preflight', config);
  },

  previewSamplePrompt(config) {
    return postJson('/api/train/sample_prompt', config);
  },

  getLogDirs() {
    return request('/api/log_dirs');
  },

  getLogDetail(dir) {
    return request(`/api/log_detail?dir=${encodeURIComponent(dir)}`);
  },

  runInterrogate(params) {
    return postJson('/api/interrogate', params);
  },

  getDatasetTags(dir) {
    return request(`/api/dataset_tags?dir=${encodeURIComponent(dir)}`);
  },

  saveDatasetTag(params) {
    return postJson('/api/dataset_tags/save', params);
  },

  runImageResize(params) {
    return postJson('/api/image_resize', params);
  },

  getImageResizeStatus() {
    return request('/api/local/image_resize_status').catch(() => ({ status: 'success', data: { process_status: 'done', lines: ['（后端模式下不支持实时日志，任务已在后台运行）'] } }));
  },

  getSampleImages() {
    return request('/api/local/sample_images');
  },

  openFolder(folder) {
    return postJson('/api/local/open_folder', { folder: folder || 'output' });
  },
  runTraining(config) {
    return postJson('/api/run', config);
  },

  // === 新增接口 ===

  /** 获取标签编辑器启动状态 */
  getTagEditorStatus() {
    return request('/api/tageditor_status');
  },

  /** 获取可用标注模型列表（WD14 / CL / LLM） */
  getInterrogators() {
    return request('/api/interrogators');
  },

  /** 数据集分析 */
  analyzeDataset(params) {
    return postJson('/api/dataset/analyze', params);
  },

  /** Masked-loss 数据集审查 */
  maskedLossAudit(params) {
    return postJson('/api/dataset/masked_loss_audit', params);
  },

  /** Caption 清洗 - 预览 */
  captionCleanupPreview(params) {
    return postJson('/api/captions/cleanup/preview', params);
  },

  /** Caption 清洗 - 应用 */
  captionCleanupApply(params) {
    return postJson('/api/captions/cleanup/apply', params);
  },

  /** Caption 备份 - 创建 */
  captionBackupCreate(params) {
    return postJson('/api/captions/backups/create', params);
  },

  /** Caption 备份 - 列表 */
  captionBackupList(params) {
    return postJson('/api/captions/backups/list', params);
  },

  /** Caption 备份 - 恢复 */
  captionBackupRestore(params) {
    return postJson('/api/captions/backups/restore', params);
  },

  /** 图像预处理预览 */
  imageResizePreview(inputDir, recursive = false, limit = 8) {
    return request(`/api/image_resize/preview?input_dir=${encodeURIComponent(inputDir)}&recursive=${recursive}&limit=${limit}`);
  },

  /** 获取可用脚本列表 */
  getAvailableScripts() {
    return request('/api/scripts');
  },

  /** 获取文件列表（模型文件 / 训练目录） */
  getFiles(pickType) {
    return request(`/api/get_files?pick_type=${encodeURIComponent(pickType)}`);
  },

  /** 获取配置摘要 */
  getConfigSummary() {
    return request('/api/config/summary');
  },

  /** 获取训练任务输出日志 */
  getTaskOutput(taskId, tail = 100) {
    return request(`/api/task_output/${taskId}?tail=${tail}`);
  },

  /** GPU 实时状态 (VRAM 占用等) */
  getGpuStatus() {
    return request('/api/gpu_status');
  },

  /** 系统资源监控 (GPU VRAM + CPU + RAM) */
  getSystemMonitor() {
    return request('/api/system_monitor');
  },

  /** 切换当前启用的 UI */
  activateUiProfile(profileId) {
    return postJson('/api/ui_profiles/activate', { profile_id: profileId });
  },

  /** 列出数据集文件夹中的图片 */
  listDatasetImages(folder, limit = 6) {
    return request(`/api/dataset/list_images?folder=${encodeURIComponent(folder)}&limit=${limit}`);
  },


  // ═══ 插件系统 API ═══

  /** 获取插件运行时状态 */
  getPluginRuntime() {
    return request('/api/plugins/runtime');
  },

  /** 重新加载所有插件 */
  reloadPlugins() {
    return postJson('/api/plugins/reload', {});
  },

  /** 获取插件能力列表 */
  getPluginCapabilities() {
    return request('/api/plugins/capabilities');
  },

  /** 获取插件钩子列表 */
  getPluginHooks() {
    return request('/api/plugins/hooks');
  },

  /** 设置开发者模式 */
  setPluginDeveloperMode(enabled) {
    return postJson('/api/plugins/developer_mode', { enabled });
  },

  /** 审批插件 */
  approvePlugin(pluginId, approvedBy) {
    return postJson('/api/plugins/approve', { plugin_id: pluginId, approved_by: approvedBy || 'ui_user' });
  },

  /** 撤销插件审批 */
  revokePluginApproval(pluginId) {
    return postJson('/api/plugins/revoke_approval', { plugin_id: pluginId });
  },

  /** 获取插件审计日志 */
  getPluginAudit(limit) {
    return request('/api/plugins/audit' + (limit ? '?limit=' + limit : ''));
  },

};
