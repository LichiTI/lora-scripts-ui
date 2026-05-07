import fs from 'node:fs';
import { spawn as nodeSpawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { defineConfig } from 'vite';

// ── 自动检测 lora-scripts 根目录 ──
// 优先级：环境变量 LORA_SCRIPTS_ROOT > ui 的上级目录（即 ui/ 放在 lora-scripts 内部）> ui 同级的 lora-scripts-*
const uiRoot = path.resolve(__dirname);
const parentDir = path.resolve(uiRoot, '..');

function detectLoraScriptsRoot() {
  if (process.env.LORA_SCRIPTS_ROOT && fs.existsSync(process.env.LORA_SCRIPTS_ROOT)) {
    return path.resolve(process.env.LORA_SCRIPTS_ROOT);
  }
  // ui/ 放在 lora-scripts 训练包内部（推荐部署方式）
  if (fs.existsSync(path.join(parentDir, 'train')) && fs.existsSync(path.join(parentDir, 'sd-models'))) {
    return parentDir;
  }
  // ui/ 与 lora-scripts-* 同级（开发时的目录结构）
  const siblings = fs.readdirSync(path.resolve(parentDir)).filter(
    (d) => d.startsWith('lora-scripts') && fs.statSync(path.join(parentDir, d)).isDirectory()
  );
  if (siblings.length > 0) {
    return path.join(parentDir, siblings[0]);
  }
  // 兜底：假设 ui/ 就在训练包内
  return parentDir;
}

const LORA_ROOT = detectLoraScriptsRoot();
const builtinPickerRoots = {
  folder: path.join(LORA_ROOT, 'train'),
  'output-folder': path.join(LORA_ROOT, 'output'),
  'model-file': path.join(LORA_ROOT, 'sd-models'),
  file: path.join(LORA_ROOT, 'sd-models'),
  'model-saved-file': path.join(LORA_ROOT, 'output'),
};
const SAVED_PARAMS_DIR = path.join(uiRoot, 'saved_params');
const TASK_HISTORY_FILE = path.join(uiRoot, 'task_history.json');

// ── 图像预处理进程状态 ──
let _resizeState = { status: 'idle', lines: [], pid: null };

// ── 查找 Python 环境并确保 Pillow 可用 ──
let _pythonEnvCache = null;

function findPythonEnv() {
  if (_pythonEnvCache) return _pythonEnvCache;

  // 候选 Python 环境列表
  const candidates = [
    'python_sageattention', 'python-sageattention',
    'python_rocm_amd', 'python-rocm-amd',
    'python_xpu_intel', 'python-xpu-intel',
    'python_sagebwd_nvidia', 'python-sagebwd-nvidia',
    'python',
  ];

  let pythonBin = 'python';
  for (const dir of candidates) {
    const candidate = path.join(LORA_ROOT, dir, 'python.exe');
    if (fs.existsSync(candidate)) {
      pythonBin = candidate;
      break;
    }
  }

  // 检查 Pillow 是否可用，不可用则自动安装
  try {
    execFileSync(pythonBin, ['-c', 'from PIL import Image'], { timeout: 10000, stdio: 'ignore' });
  } catch (_pillowCheckErr) {
    console.log('[image_resize] Pillow not found, installing...');
    try {
      execFileSync(pythonBin, ['-m', 'pip', 'install', 'Pillow', '--quiet', '--disable-pip-version-check'], {
        timeout: 120000,
        stdio: 'inherit',
        cwd: LORA_ROOT,
      });
      console.log('[image_resize] Pillow installed successfully.');
    } catch (installErr) {
      console.error('[image_resize] Failed to install Pillow:', installErr.message);
    }
  }

  _pythonEnvCache = { bin: pythonBin, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } };
  return _pythonEnvCache;
}




// ── 后端连通性状态（proxy configure 和 middleware 共享） ──
let _backendAlive = null;   // null=未知  true=在线  false=离线
let _backendCheckTime = 0;

function readBuiltinPickerItems(pickerType) {
  const rootPath = builtinPickerRoots[pickerType] || builtinPickerRoots.file;
  const rootLabel = path.relative(LORA_ROOT, rootPath).replaceAll('\\', '/');
  const entries = fs.existsSync(rootPath)
    ? fs.readdirSync(rootPath, { withFileTypes: true })
    : [];

  let items = entries
    .filter((entry) => {
      if (pickerType === 'folder' || pickerType === 'output-folder') {
        return entry.isDirectory();
      }
      return entry.isFile() && entry.name.toLowerCase().endsWith('.safetensors');
    })
    .map((entry) => entry.name)
    .filter((name) => {
      if (name.startsWith('.')) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  return {
    rootLabel,
    items,
  };
}

export default defineConfig({
  root: './',
  base: './', // Use relative paths for assets to support various deployment scenarios
  server: {
    port: 3006,
    open: true,
    middlewareMode: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:28000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            _backendAlive = false;
            _backendCheckTime = Date.now();
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              try {
                res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                  status: 'error',
                  message: '后端服务未启动或无法连接 (127.0.0.1:28000)',
                }));
              } catch (_ignored) { /* response already closed */ }
            }
          });
          proxy.on('proxyRes', () => {
            _backendAlive = true;
            _backendCheckTime = Date.now();
          });
        }
      }
    }
  },
  plugins: [
    {
      name: 'builtin-picker-api',
      configureServer(server) {
        // ── Mock API：后端不存在的路由，在开发模式下本地模拟 ──

        // ── 后端连通性探测工具 ──
        let _backendChecking = false;
        const BACKEND_CHECK_INTERVAL = 5000;

        function probeBackend() {
          if (_backendChecking) return;
          _backendChecking = true;
          _backendCheckTime = Date.now();
          const req = http.get('http://127.0.0.1:28000/api/tasks', { timeout: 2000 }, (res) => {
            res.resume();
            _backendAlive = res.statusCode < 500;
            _backendChecking = false;
          });
          req.on('error', () => { _backendAlive = false; _backendChecking = false; });
          req.on('timeout', () => { req.destroy(); _backendAlive = false; _backendChecking = false; });
        }

        // 训练预检（本地验证参数路径是否存在）
        server.middlewares.use('/api/train/preflight', (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const config = JSON.parse(body);
              const errors = [];
              const warnings = [];

              // 检查底模路径
              const modelPath = config.pretrained_model_name_or_path;
              if (modelPath) {
                const absModel = path.resolve(LORA_ROOT, modelPath);
                if (!fs.existsSync(absModel)) {
                  errors.push(`底模文件不存在：${modelPath}`);
                }
              } else {
                errors.push('未指定底模路径');
              }

              // 检查训练数据集路径
              const trainDir = config.train_data_dir;
              if (trainDir) {
                const absTrainDir = path.resolve(LORA_ROOT, trainDir);
                if (!fs.existsSync(absTrainDir)) {
                  errors.push(`训练数据集目录不存在：${trainDir}`);
                } else {
                  const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
                  let hasImages = false;
                  const scan = (dir) => {
                    if (hasImages) return;
                    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                      if (e.isDirectory()) { scan(path.join(dir, e.name)); }
                      else if (imgExts.includes(path.extname(e.name).toLowerCase())) { hasImages = true; return; }
                    }
                  };
                  scan(absTrainDir);
                  if (!hasImages) {
                    errors.push(`训练数据集目录下没有图片文件：${trainDir}`);
                  }
                }
              } else {
                errors.push('未指定训练数据集路径');
              }

              // 检查输出目录
              const outputDir = config.output_dir;
              if (outputDir) {
                const absOutput = path.resolve(LORA_ROOT, outputDir);
                if (!fs.existsSync(absOutput)) {
                  warnings.push(`输出目录不存在（训练时会自动创建）：${outputDir}`);
                }
              }

              const can_start = errors.length === 0;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success', data: { can_start, errors, warnings } }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'error', message: error.message || '预检失败' }));
            }
          });
        });

        // 显卡信息 mock（后端未启动时的兜底）
        server.middlewares.use('/api/graphic_cards', (req, res, next) => {
          // 尝试转发给后端，如果后端没启动则返回 mock
          next();
        });

        // ── 文件浏览 / 参数管理等本地 API ──

        server.middlewares.use('/api/builtin_picker', (req, res, next) => {
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const pickerType = requestUrl.searchParams.get('picker_type') || 'file';
            const data = readBuiltinPickerItems(pickerType);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              status: 'error',
              message: error instanceof Error ? error.message : '读取内置文件选择器数据失败。',
            }));
          }
        });

        // 保存参数 API
        server.middlewares.use('/api/saved_configs/save', (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const { name, config } = JSON.parse(body);
              if (!name || !config) throw new Error('缺少参数名称或配置内容。');
              if (!fs.existsSync(SAVED_PARAMS_DIR)) fs.mkdirSync(SAVED_PARAMS_DIR, { recursive: true });
              const safeName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
              const filePath = path.join(SAVED_PARAMS_DIR, `${safeName}.json`);
              fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success', data: { name: safeName } }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'error', message: error.message || '保存失败。' }));
            }
          });
        });

        // 列出已保存参数 API
        server.middlewares.use('/api/saved_configs/list', (req, res, next) => {
          try {
            if (!fs.existsSync(SAVED_PARAMS_DIR)) fs.mkdirSync(SAVED_PARAMS_DIR, { recursive: true });
            const files = fs.readdirSync(SAVED_PARAMS_DIR)
              .filter((f) => f.endsWith('.json'))
              .map((f) => {
                const stat = fs.statSync(path.join(SAVED_PARAMS_DIR, f));
                return { name: f.replace(/\.json$/, ''), time: stat.mtimeMs };
              })
              .sort((a, b) => b.time - a.time);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { configs: files } }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || '读取列表失败。' }));
          }
        });

        // 读取某个已保存参数 API
        server.middlewares.use('/api/saved_configs/load', (req, res, next) => {
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const name = requestUrl.searchParams.get('name');
            if (!name) throw new Error('缺少参数名称。');
            const filePath = path.join(SAVED_PARAMS_DIR, `${name}.json`);
            if (!fs.existsSync(filePath)) throw new Error('参数文件不存在。');
            const content = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: JSON.parse(content) }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || '读取失败。' }));
          }
        });

        // 删除已保存参数 API
        server.middlewares.use('/api/saved_configs/delete', (req, res, next) => {
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const name = requestUrl.searchParams.get('name');
            if (!name) throw new Error('缺少参数名称。');
            const filePath = path.join(SAVED_PARAMS_DIR, `${name}.json`);
            if (!fs.existsSync(filePath)) throw new Error('参数文件不存在。');
            fs.unlinkSync(filePath);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success' }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || '删除失败。' }));
          }
        });

        // 重命名已保存参数 API
        server.middlewares.use('/api/saved_configs/rename', (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const { oldName, newName } = JSON.parse(body);
              if (!oldName || !newName) throw new Error('缺少原名称或新名称。');
              const safeOld = oldName.replace(/[<>:"\/\\|?*]/g, '_').trim();
              const safeNew = newName.replace(/[<>:"\/\\|?*]/g, '_').trim();
              if (!safeNew) throw new Error('新名称无效。');
              if (safeOld === safeNew) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ status: 'success', data: { name: safeNew } }));
                return;
              }
              const oldPath = path.join(SAVED_PARAMS_DIR, `${safeOld}.json`);
              const newPath = path.join(SAVED_PARAMS_DIR, `${safeNew}.json`);
              if (!fs.existsSync(oldPath)) throw new Error('原参数文件不存在。');
              if (fs.existsSync(newPath)) throw new Error('新名称已存在，请换一个名称。');
              fs.renameSync(oldPath, newPath);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success', data: { name: safeNew } }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'error', message: error.message || '重命名失败。' }));
            }
          });
        });


        // 日志目录列表 API
        server.middlewares.use('/api/log_dirs', (req, res, next) => {
          try {
            const logsRoot = path.join(LORA_ROOT, 'logs');
            if (!fs.existsSync(logsRoot)) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success', data: { dirs: [] } }));
              return;
            }
            const dirs = fs.readdirSync(logsRoot, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => {
                const dirPath = path.join(logsRoot, d.name);
                const stat = fs.statSync(dirPath);
                const events = fs.readdirSync(dirPath).filter((f) => f.startsWith('events.out'));
                return { name: d.name, time: stat.mtimeMs, hasEvents: events.length > 0 };
              })
              .sort((a, b) => b.time - a.time);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { dirs } }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || '读取日志目录失败。' }));
          }
        });

        // 日志目录详情 API
        server.middlewares.use('/api/log_detail', (req, res, next) => {
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const dirName = requestUrl.searchParams.get('dir');
            if (!dirName) throw new Error('缺少目录名。');
            const logsRoot = path.join(LORA_ROOT, 'logs');
            const dirPath = path.join(logsRoot, dirName);
            if (!fs.existsSync(dirPath)) throw new Error('日志目录不存在。');
            const files = fs.readdirSync(dirPath).map((f) => {
              const stat = fs.statSync(path.join(dirPath, f));
              return { name: f, size: stat.size, time: stat.mtimeMs };
            });
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { dir: dirName, files } }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || '读取日志详情失败。' }));
          }
        });

        // 数据集标签读取 API
        server.middlewares.use('/api/dataset_tags', (req, res, next) => {
          if (req.method === 'POST') { next(); return; }
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const dirName = requestUrl.searchParams.get('dir');
            if (!dirName) throw new Error('缺少目录名。');
            const trainRoot = path.join(LORA_ROOT, 'train');
            const dirPath = path.join(trainRoot, dirName);
            if (!fs.existsSync(dirPath)) throw new Error('目录不存在。');

            const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
            const results = [];
            const scanDir = (dir) => {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) { scanDir(path.join(dir, entry.name)); continue; }
                const ext = path.extname(entry.name).toLowerCase();
                if (!imgExts.includes(ext)) continue;
                const imgPath = path.join(dir, entry.name);
                const txtPath = imgPath.replace(/\.[^.]+$/, '.txt');
                const relPath = path.relative(dirPath, imgPath).replaceAll('\\', '/');
                let tags = '';
                if (fs.existsSync(txtPath)) {
                  tags = fs.readFileSync(txtPath, 'utf-8').trim();
                }
                results.push({ image: relPath, tags });
              }
            };
            scanDir(dirPath);
            results.sort((a, b) => a.image.localeCompare(b.image, 'zh-CN'));
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { dir: dirName, items: results } }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || '读取数据集标签失败。' }));
          }
        });

        // 保存单个标签 API
        server.middlewares.use('/api/dataset_tags/save', (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const { dir, image, tags } = JSON.parse(body);
              if (!dir || !image) throw new Error('缺少参数。');
              const trainRoot = path.join(LORA_ROOT, 'train');
              const imgPath = path.join(trainRoot, dir, image);
              if (!fs.existsSync(imgPath)) throw new Error('图片文件不存在。');
              const txtPath = imgPath.replace(/\.[^.]+$/, '.txt');
              fs.writeFileSync(txtPath, tags || '', 'utf-8');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success' }));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'error', message: error.message || '保存标签失败。' }));
            }
          });
        });

        // ── 图像预处理 API（带实时输出捕获） ──
        server.middlewares.use('/api/local/image_resize', (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const params = JSON.parse(body);
              const builtinScript = path.join(uiRoot, 'tools', 'image_resize.py');
              const externalScript = path.join(LORA_ROOT, 'train', '训练图像缩放预处理工具.py');
              const scriptPath = fs.existsSync(builtinScript) ? builtinScript : externalScript;
              if (!fs.existsSync(scriptPath)) throw new Error('预处理脚本不存在（ui/tools/image_resize.py 和 train/训练图像缩放预处理工具.py 均未找到）。');

              if (_resizeState.status === 'running') {
                res.end(JSON.stringify({ status: 'error', message: '已有图像预处理任务正在运行，请等待完成。' }));
                return;
              }

              const args = ['--no-gui', '-d', params.input_dir || '.'];
              if (params.output_dir) args.push('-o', params.output_dir);
              if (params.recursive) args.push('-r');
              if (params.format && params.format !== 'ORIGINAL') args.push('-f', params.format);
              if (params.quality) args.push('-q', String(params.quality));
              if (!params.enable_resize) args.push('--no-resize');
              if (params.rename) args.push('--rename');
              if (params.delete_original) args.push('--delete-source');
              if (!params.sync_metadata) args.push('--no-sync');

              const pyEnv = findPythonEnv();

              _resizeState = { status: 'running', lines: [], pid: null };

              const child = nodeSpawn(pyEnv.bin, [scriptPath, ...args], {
                cwd: LORA_ROOT,
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: pyEnv.env,
              });
              _resizeState.pid = child.pid || null;

              const pushLine = (raw) => {
                const text = raw.toString('utf-8').replace(/\r?\n$/, '');
                if (text) {
                  text.split(/\r?\n/).forEach(l => { if (l) _resizeState.lines.push(l); });
                }
              };
              if (child.stdout) child.stdout.on('data', pushLine);
              if (child.stderr) child.stderr.on('data', pushLine);

              child.on('close', (code) => {
                _resizeState.status = code === 0 ? 'done' : 'error';
                _resizeState.lines.push(code === 0 ? '\n✅ 图像预处理完成。' : `\n❌ 图像预处理异常退出 (code: ${code})`);
                _resizeState.pid = null;
              });
              child.on('error', (err) => {
                _resizeState.status = 'error';
                _resizeState.lines.push(`❌ 启动失败: ${err.message}`);
                _resizeState.pid = null;
              });

              res.end(JSON.stringify({ status: 'success', message: '图像预处理已启动，请查看实时日志。' }));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ status: 'error', message: error.message || '启动图像预处理失败。' }));
            }
          });
        });

        // ── 训练预览图 API ──
        server.middlewares.use('/api/local/sample_images', (req, res, next) => {
          try {
            const sampleDir = path.join(LORA_ROOT, 'output', 'sample');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (!fs.existsSync(sampleDir) || !fs.statSync(sampleDir).isDirectory()) {
              res.end(JSON.stringify({ status: 'success', data: { images: [], total: 0 } }));
              return;
            }
            const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
            const allFiles = fs.readdirSync(sampleDir)
              .filter(f => imgExts.includes(path.extname(f).toLowerCase()))
              .sort((a, b) => {
                const ta = fs.statSync(path.join(sampleDir, a)).mtimeMs;
                const tb = fs.statSync(path.join(sampleDir, b)).mtimeMs;
                return tb - ta;
              });
            const images = allFiles.map(f => ({
              name: f,
              path: path.join(sampleDir, f).replaceAll('\\', '/'),
              mtime: fs.statSync(path.join(sampleDir, f)).mtimeMs,
            }));
            res.end(JSON.stringify({ status: 'success', data: { images, total: images.length } }));
          } catch (_e) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: _e.message || 'Failed' }));
          }
        });

        // 训练预览图文件服务
        server.middlewares.use('/api/local/sample_file', (req, res, next) => {
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const fileName = requestUrl.searchParams.get('name') || '';
            if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) throw new Error('Invalid file name');
            const filePath = path.join(LORA_ROOT, 'output', 'sample', fileName);
            if (!fs.existsSync(filePath)) { res.statusCode = 404; res.end('Not found'); return; }
            const ext = path.extname(fileName).toLowerCase();
            const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp' };
            res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            fs.createReadStream(filePath).pipe(res);
          } catch (_e) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain');
            res.end(_e.message || 'Error');
          }
        });

        // 打开文件夹（资源管理器）
        server.middlewares.use('/api/local/open_folder', (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const { folder } = JSON.parse(body);
              const targetDir = path.resolve(LORA_ROOT, folder || 'output');
              if (!fs.existsSync(targetDir)) { fs.mkdirSync(targetDir, { recursive: true }); }
              // Windows: explorer, macOS: open, Linux: xdg-open
              const opener = process.platform === 'win32' ? 'explorer' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
              nodeSpawn(opener, [targetDir], { detached: true, stdio: 'ignore' }).unref();
              res.end(JSON.stringify({ status: 'success' }));
            } catch (_e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ status: 'error', message: _e.message || 'Failed' }));
            }
          });
        });


        // 图像预处理状态轮询
        server.middlewares.use('/api/local/image_resize_status', (req, res, next) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            status: 'success',
            data: { process_status: _resizeState.status, lines: _resizeState.lines, pid: _resizeState.pid },
          }));
        });

        // ── 本地任务历史持久化 ──
        server.middlewares.use('/api/local/task_history', (req, res, next) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (req.method === 'GET') {
            try {
              const data = fs.existsSync(TASK_HISTORY_FILE)
                ? JSON.parse(fs.readFileSync(TASK_HISTORY_FILE, 'utf-8'))
                : [];
              res.end(JSON.stringify({ status: 'success', data: { tasks: data } }));
            } catch (e) {
              res.end(JSON.stringify({ status: 'success', data: { tasks: [] } }));
            }
          } else if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              try {
                const { tasks } = JSON.parse(body);
                fs.writeFileSync(TASK_HISTORY_FILE, JSON.stringify(tasks || [], null, 2), 'utf-8');
                res.end(JSON.stringify({ status: 'success' }));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ status: 'error', message: e.message }));
              }
            });
          } else if (req.method === 'DELETE') {
            try {
              if (fs.existsSync(TASK_HISTORY_FILE)) fs.unlinkSync(TASK_HISTORY_FILE);
              res.end(JSON.stringify({ status: 'success' }));
            } catch (e) {
              res.end(JSify({ status: 'error', message: e.message }));
            }
          } else {
            next();
          }
        });

        // ── 后端缺失端点的本地补丁（后端更新后前端仍需要的接口） ──

        // 任务日志输出 — 尝试转发后端，失败则返回空
        server.middlewares.use('/api/task_output/', (req, res, next) => {
          // req.url in connect middleware with a mount path has the prefix stripped.
          // Reconstruct the full backend URL explicitly.
          const backendUrl = 'http://127.0.0.1:28000/api/task_output/' + (req.url || '').replace(/^\//, '');
          const proxyReq = http.get(backendUrl, { timeout: 2000 }, (proxyRes) => {
            if (proxyRes.statusCode < 400) {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            } else {
              proxyRes.resume();
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success', data: { lines: [], total: 0 } }));
            }
          });
          proxyReq.on('error', () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { lines: [], total: 0 } }));
          });
          proxyReq.on('timeout', () => {
            proxyReq.destroy();
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { lines: [], total: 0 } }));
          });
        });

        // GPU 实时状态 — 尝试转发后端，失败则返回不可用
        server.middlewares.use('/api/gpu_status', (req, res, next) => {
          const proxyReq = http.get('http://127.0.0.1:28000/api/gpu_status', { timeout: 2000 }, (proxyRes) => {
            if (proxyRes.statusCode < 400) {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            } else {
              proxyRes.resume();
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ status: 'success', data: { available: false } }));
            }
          });
          proxyReq.on('error', () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { available: false } }));
          });
          proxyReq.on('timeout', () => {
            proxyReq.destroy();
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { available: false } }));
          });
        });

        // 数据集图片列表 — 本地实现（读文件系统）
        server.middlewares.use('/api/dataset/list_images', (req, res, next) => {
          try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const folder = requestUrl.searchParams.get('folder') || '';
            const limit = parseInt(requestUrl.searchParams.get('limit') || '6');
            if (!folder) throw new Error('folder is required');
            const folderPath = path.resolve(folder);
            if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
              throw new Error('Folder not found');
            }
            const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
            const allFiles = fs.readdirSync(folderPath)
              .filter((f) => imgExts.includes(path.extname(f).toLowerCase()))
              .sort((a, b) => a.localeCompare(b, 'zh-CN'));
            const images = allFiles.slice(0, limit).map((f) => path.join(folderPath, f));
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'success', data: { images, total: allFiles.length, first_tag: '' } }));
          } catch (error) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ status: 'error', message: error.message || 'Failed to list images' }));
          }
        });

        // 任务删除（单个 / 全部）— 前端自行处理状态，服务端只需返回成功
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'DELETE' || !req.url || !req.url.startsWith('/api/tasks')) return next();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ status: 'success', message: 'Removed', data: { deleted: 0 } }));
        });



        // ── 后端离线拦截中间件（放在所有本地 mock API 之后） ──
        // 当后端确认离线时，直接返回 502 JSON，不触发 Vite proxy（避免报错刷屏）
        server.middlewares.use((req, res, next) => {
          if (!req.url || !req.url.startsWith('/api/')) return next();

          const now = Date.now();
          if (now - _backendCheckTime > BACKEND_CHECK_INTERVAL) {
            probeBackend();
          }

          // 未知或在线 → 放行给 proxy
          if (_backendAlive === null || _backendAlive === true) {
            return next();
          }

          // 已确认离线 → 直接返回 502 JSON
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            status: 'error',
            message: '后端服务未启动 (127.0.0.1:28000)，请先通过启动脚本或 gui.py 启动后端。',
          }));
        });
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
