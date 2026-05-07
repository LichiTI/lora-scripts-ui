## 1. 拆分架构概览

重构后的架构将 `main.js` 的定位从“全能上帝类”转换为 **“状态容器与模块接线层 (Wiring Layer)”**。
所有功能被划分为三类：`utils`（纯函数工具）、`features`（功能控制器组件）、`schema`（后端表单定义）。

### 1.1 `utils` 工具模块
负责基础逻辑抽象，无 UI 状态耦合：
- **`dom.js`**: `$`、`$$` 选择器、`escapeHtml` 净化器及轻量级 `showToast`。
- **`toml.js`**: TOML 格式轻量解析与序列化，替代以前在 `main.js` 结尾大段的 AST 遍历逻辑。
- **`preferences.js`**: 浏览器 `localStorage` 读取及持久化（例如 `jsonPanelCollapsed`、界面主题、抽屉状态）。
- **`trainingMetrics.js`**: 训练日志指标解析（Loss、Step、Speed 计算）及概要卡片数据结构生成。
- **`logRendering.js`**: 纯计算模块，处理增量日志 `cursor`、重复进度条过滤和 HTML 生成。

### 1.2 `features` 功能组件 (Controllers)
各业务模块被封装为工厂函数（例如 `createDatasetPageController`），在 `main.js` 中注入依赖并在 `bindGlobals(window)` 时暴露出对应的 `window.*` 内联方法：

- **`appShell.js`**: 渲染导航栏 (Navigator)、顶栏 (Topbar)、左侧栏、暗/亮主题切换、界面布局偏好管理。
- **`configRenderer.js`**: 动态表单的核心渲染器，将 TOML/JSON 配置转化为 DOM（下拉框、输入框、内置选择器）。
- **`configActions.js`**: 配置的导入、导出为 `.toml`、撤销参数修改、重置参数以及切换训练类型 (Training Type)。
- **`trainingPage.js`**: 渲染训练监控主页，包含 GPU 状态、实时 Loss 折线图 (Sparkline)、数据集预检摘要。
- **`trainingActions.js`**: 训练操作控制器：启动预检 (`runPreflight`)、环境监测 (`refreshRuntime`)、启动训练 (`executeTraining`)、终止任务 (`terminateAllTasks`)、清空历史任务。
- **`bootstrapRuntime.js`**: 系统级后台任务管理：初始化加载默认配置 (`loadBootstrapData`) 和任务轮询服务 (`startTaskPolling`) 以及自动清理前状态同步。
- **`taskHistorySummary.js`**: 解析已结束的训练任务，渲染评分摘要卡片，并管理 `localTaskHistory` 在浏览器 Session 和后端磁盘上的双向同步。
- **`datasetPage.js`**: 数据集工作流：AI 打标器 (`runTagger`)、尺寸预处理 (`runImageResize`)、Caption 批量清洗、蒙版损失审查。
- **`samplesPanel.js`**: 训练样本的图片浏览与灯箱 (`Lightbox`) 组件。
- **`builtinPicker.js`**: 模型与目录的内置浮层选择器 (`modal`)。
- **`pickerRuntime.js`**: 调用本地文件浏览器 (Native File System) 的弹窗支持。
- **`savedConfigs.js`**: 自定义参数组合的命名保存、读取与删除管理弹窗。
- **`settingsPage.js` & `settingsOptions.js`**: UI 界面设置及默认优化器/调度器展示设置。
- **`toolsPage.js` & `toolDefinitions.js`**: `SDXL/Flux/Anima` 等底模转换、元数据查询工具运行及进度条读取。
- **`topbarSearch.js`**: 全局跨 Tab 配置项模糊搜索与 `jumpToConfigField`。
- **`pluginCenter.js` & `pluginCenterController.js`**: 后端插件的加载、启停、展示管理面板。
- **`staticPages.js`**: 静态文本说明（教程、关于、更新日志）。

---

## 接线模式示例 

重构后，`main.js` 将扮演以下角色：

```javascript
// 1. 初始化核心状态容器
const state = { config: {}, tasks: [], activeModule: 'config', ... };

// 2. 注入依赖，实例化 Controller
const datasetPage = createDatasetPageController({
  api, state, renderView, showToast 
});

// 3. 将原 main.js 暴露给内联 HTML 的全局函数统一挂载
datasetPage.bindGlobals(window);
```
此模式的优势在于：
1. 原 HTML 无需改动任何 `onclick="runTagger()"`。
2. 规避了因循环引用导致的构建失败（所有的 `features/` 模块之间解耦，依赖仅靠形参）。

## 后续开发与维护指引

1. **新增 Schema 参数**: 
   若要在 WebUI 添加新训练参数，请直接编辑 `plugin/lora-scripts-ui-main/ui/src/sdxlSchema.js` 的 `getSectionsForType`，新字段会自动通过 `configRenderer.js` 渲染。

2. **添加新的标签页 / 工具**:
   如果需要新页面，在 `features/` 目录中创建类似于 `myNewPage.js` 的导出对象。然后在 `main.js` 的 `renderView` 路由判断中加入该组件。

3. **构建流程**:
   目前 WebUI 的产物由 Vite 构建：
   ```bash
   cd plugin/lora-scripts-ui-main/ui
   npm install
   npm run build
   ```
   构建出的 `dist/index.html` 会被 `mikazuki/utils/frontend_profiles.py` 自动检索接管为活跃的 Profile (`community:lora-scripts-ui-main`) 并由 FastApi 提供宿主服务。
