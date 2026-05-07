# LoRA ReScripts UI V2.0.0

这是 SD-reScripts 的**新前端**，对应目录为 `plugin/lora-scripts-ui-main/ui/`。
仅适配重置版秋叶丹炉：https://github.com/WhitecrowAurora/lora-rescripts 请自行下载
本文档中的“新前端”专指 `plugin/lora-scripts-ui-main/ui/`；除此之外，项目当前默认自带的界面可视为“旧前端 / 经典 UI”。

推荐使用方式：**通过重置版秋叶丹炉的启动器启动**。

---


### 相关配置

新前端的启用状态由后端配置控制，配置项位于：

- `assets/config.json`

关键字段：

```json
{
  "active_ui_profile": "community:lora-scripts-ui-main"
}
```

---

## 目录结构

```text
plugin/lora-scripts-ui-main/
└── ui/
    ├── src/
    │   ├── main.js
    │   ├── api.js
    │   ├── sdxlSchema.js
    │   ├── i18n.js
    │   └── style.css
    ├── saved_params/        # 历史开发模式下保存的参数文件
    ├── dist/                # 可选构建产物；若存在会优先于 ui/ 源码目录被后端识别
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── README.md
```

### 说明

- `ui/`：新前端源码目录
- `ui/dist/`：如果执行过 Vite build，后端在扫描候选入口时通常会优先使用这里
- `ui/saved_params/`：这是早期 / 开发模式下可能使用到的本地参数目录

在**当前后端直连模式**下，参数保存的实际目录通常是：

```text
assets/ui_state/saved_configs/
```

如果你以前在 Vite 开发模式中保存过参数，而现在在 28000 端口读取不到，通常就是因为参数还在 `ui/saved_params/`，没有同步到 `assets/ui_state/saved_configs/`。

---

## 与旧前端的关系

- **新前端**：`plugin/lora-scripts-ui-main/ui/`
- **旧前端 / 经典 UI**：项目原本内置的默认前端

当前新前端内部已经提供：

- 切换回经典 UI 的按钮
- 通过后端 API 切换 `active_ui_profile`
- 同端口刷新切换（通常仍然是 `28000`）

因此日常使用时，不需要再单独开一个新的前端服务端口。

---

## 快速开始

### 日常使用

直接使用项目根目录的启动器即可，无需单独运行本目录下的 bat。

典型流程：

1. 启动根目录 launcher / 启动器
2. 启动后端
3. 打开 `http://127.0.0.1:28000`
4. 切换到新前端，或直接由后端默认进入新前端

### 如果切不到新前端，请检查

1. `assets/config.json` 中是否为：

```json
"active_ui_profile": "community:lora-scripts-ui-main"
```

2. 后端是否还能识别 `plugin/lora-scripts-ui-main/ui/index.html`
3. `mikazuki/utils/frontend_profiles.py` 是否保留了对以下目录的识别：
   - `plugin_dir / "ui" / "dist"`
   - `plugin_dir / "ui"`
   - `plugin_dir / "dist"`
   - `plugin_dir / "frontend" / "dist"`
   - `plugin_dir / "frontend"`
4. 如果存在旧的 `ui/dist/` 构建产物，它可能会优先于 `ui/` 源码目录被使用

---

## 开发说明（仅开发时需要）

虽然日常使用已经不再依赖 Vite，但本目录依然保留了 Vite 相关文件，方便开发和调试。

### 启动开发模式

```bash
cd plugin/lora-scripts-ui-main/ui
npm install
npm run dev
```

开发模式主要用于：

- 前端页面调试
- HMR 热更新
- 样式 / 交互开发

### 开发模式注意事项

1. `vite.config.js` 会尝试自动检测项目根目录
2. 部分接口在历史上由 Vite 本地中间件处理
3. 当前主使用路径已经改为**由后端直接托管前端页面**
4. 如果你只想正常使用新前端，**不需要安装 Node.js，也不需要运行 Vite**

---

## 构建说明

如需生成构建产物：

```bash
npm run build
```

输出目录：

```text
plugin/lora-scripts-ui-main/ui/dist/
```

### 注意

如果 `ui/dist/` 存在，后端通常会优先把它当成新前端入口。

这意味着：

- 如果你修改了 `ui/src/` 但没有重新 build
- 或者 `dist/` 是旧版本产物

那么后端仍可能继续显示旧的构建版页面，而不是最新源码版页面。

如果你希望后端直接使用 `ui/` 下的源码页面，可以删除旧的 `ui/dist/`。

---

## 功能概览

### 配置

- SDXL LoRA 等训练参数表单
- 中文参数标签
- 右侧 JSON 参数预览
- 参数恢复默认 / 撤销修改
- 路径字段内置选择器

### 参数管理

- 保存参数
- 读取参数
- 删除参数
- 导入 / 导出配置
- 重置当前参数

### 数据集处理

- 自动标注
- 标签编辑相关入口
- 图像预处理

### 日志与工具

- 日志目录查看
- LoRA 提取
- LoRA 合并
- 模型合并

### 设置

- 主题切换
- 面板宽度调整
- 布局重置
- UI 切换

---

## API 说明

新前端所有接口均走 `/api/*`，主要由后端 `mikazuki/app/api.py` 提供。

常见接口包括：

- `/api/ui_profiles`
- `/api/ui_profiles/activate`
- `/api/saved_configs/list`
- `/api/saved_configs/load`
- `/api/saved_configs/save`
- `/api/local/sample_images`
- `/api/local/open_folder`
- `/api/local/task_history`
- `/api/graphic_cards`
- `/api/train/preflight`
- `/api/run`

> 说明：随着后端持续更新，接口来源已不再以“Vite 中间件”为主，当前以后端直连模式为准。

---

## 浏览器兼容性

- Chrome 90+
- Edge 90+
- Firefox 90+
- Safari 15+
