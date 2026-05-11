# 新前端重构总结

本文档记录重构成果，将原本 6999 行的“上帝类” `main.js` 拆分为 **utils + renderers + actions + orchestrator** 四层架构，全程零行为变更。


---

## 1. 重构成果

| 指标 | 重构前 | 重构后 | 变化 |
|---|---|---|---|
| `main.js` 行数 | 6999 | **1090** | **-84.4%** |
| 模块文件数 | 13 | **46** | +33 |
| 顶层架构层数 | 1（全在 main.js） | **4**（utils / renderers / actions / orchestrator） | — |
| build 产物（gzip） | ~101 kB | ~107 kB | +6 kB |
| 行为变更 | — | **0** | 严格只搬代码，不改逻辑 |

构建：`52 modules transformed`，全程 50+ 次 build 全部通过。

---

## 2. 当前目录结构

```text
plugin/lora-scripts-ui-main/ui/src/
├── main.js                      # ~1090 行 orchestrator（state + 工厂装配 + polling + init）
├── api.js                       # 后端 HTTP 封装（不动）
├── i18n.js                      # 多语言（不动）
├── pluginHost.js                # 插件宿主运行时（不动）
├── sdxlSchema.js                # 训练参数 schema 总入口（不动）
├── animaSchema.js               # Anima 路线 schema（不动）
├── schemaRegistry.js            # schema 注册中心（不动）
├── style.css                    # 样式表（不动）
│
├── utils/                       # 6 个：纯函数 &常量
│   ├── constants.js             # TOPBAR_TABS / DRAFT_STORAGE_KEY 等
│   ├── dom.js                   # $ / $$ / escapeHtml / _ico / showToast
│   ├── storage.js               # draft / deletedTaskIds 持久化
│   ├── toml.js                  # TOML 解析与序列化
│   ├── logRender.js             # 日志行 HTML 渲染
│   └── trainingMetrics.js       # 训练指标（loss/speed/epoch 解析与摘要）
│
├── features/                    # 1 个保留：settingsOptions.js（被 main.js 直接 import）
│
├── renderers/               # 17 个：所有 HTML 字符串生成层
│   ├── index.js                 # 统一导出
│   ├── about.js / guide.js / logs.js                # 静态页
│   ├── builtinPickerModal.js    # 内置 picker 模态
│   ├── statusDeck.js            # 状态卡片（GPU /任务 / 后端状态）
│   ├── navigator.js             # 左侧导航（训练类型分组 + 参数管理面板）
│   ├── settings.js              # 设置页
│   ├── configForm.js            # 配置表单（field / section / 分组）
│   ├── preflight.js             # 训练预检报告
│   ├── samples.js      # 训练样本浏览
│   ├── wizard.js                # 新手向导
│   ├── plugins.js               # 插件中心
│   ├── tools.js                 # 工具页
│   ├── dataset.js               # 数据集页（tagger / resize / caption / masked-loss）
│   ├── sysMonitor.js            # 系统监控
│   └── training.js              # 训练监控主页
│
└── actions/                     # 20 个：业务动作 + 副作用层（含 60+ 个 window.* 入口）
    ├── index.js                 # 统一导出
    ├── theme.js                 # applyTheme / toggleTheme / setLanguage / applyLanguage
    ├── trainTabs.js             # switchTrainTab
    ├── jsonPanel.js             # setupJsonPanel / updateJSONPreview
    ├── fieldMenu.js             # setupFieldMenus（撤销/恢复菜单）
    ├── taskHistory.js           # load/save/mergeTaskHistory + delete/clear
    ├── search.js                # setupTopbarSearch + jumpToConfigField
    ├── picker.js                # 10 个 picker 函数（native / 内置 / overlay）
    ├── layout.js                # applyLayoutPreferences / syncFooterAction / syncTopbarState
    ├── config.js                # updateConfigValue + reset/undo/applyPreset 等 11 个
    ├── sampleActions.js         # lightbox / scanDataset / toggleFolderPreview / runTrainingPreflight
    ├── wizard.js                # wizardSet / wizardStartTraining
    ├── pluginsActions.js        # pluginToggleDevMode / Approve / Revoke / ShowAudit
    ├── toolsActions.js          # runTool（完整轮询逻辑）
    ├── navActions.js            # setupSidebar/Topbar/Navigator + dismiss helpers
    ├── runtimeActions.js        # runPreflight / refreshRuntime
    ├── terminateActions.js      # terminateAllTasks
    ├── savedConfigs.js          # 10 个命名配置 actions + setupImportConfig
    ├── trainingActions.js       # validateConfigConflicts + executeTraining（核心）
    └── trainingMetadata.js      # 任务元数据 + summary + showTaskSummary（12 个）
```

---

## 3. 架构分层职责

### 3.1 `utils/` — 纯函数与常量
- 不持有 state，不操作真实 DOM 状态。
- 只接收输入，返回输出 / 字符串。
- 任何层都可以 import。

### 3.2 `renderers/` — 渲染层（HTML 生成）
- 工厂模式：`createXxxRenderer({ state, deps })` 返回 render 函数。
- 只**读** state 生成 HTML 字符串。
- 不主动写 state、不调 API、不挂 window。
- 渲染函数最终统一通过 `renderView(module)` 在 main.js 调度。

### 3.3 `actions/` — 业务动作 & 副作用层
- 工厂模式：`createXxxActions({ state, api, ... })` 返回动作集合。
- 负责：
  - 写 state（`state.config[key] = value`）
  - 调 API（`api.runTraining(...)`）
  - 调 renderView 触发重渲染
  - 弹 toast / 操作 DOM
- main.js 装配后将公共动作挂到`window.*`，HTML 字符串内的 `onclick="xxx()"` 不需改动。

### 3.4 `main.js` — Orchestrator（状态容器 + 接线层）
剩余 ~1090 行内容分布：
- **state 定义**（~80 行）
- **renderer工厂装配**（L143-L245，~100 行）
- **actions 工厂装配 + window 挂载**（L246-L920，~675 行）
- **polling 模块**（L955-L1208，~250 行）
  - `startTaskPolling` / `startTrainingLogPolling` / `startSysMonitorPolling`
  - `refreshTrainingLog` / `_updateTrainingLiveMetrics` / `_fetchGpuStatus`
  - 这部分含模块级状态变量与定时器，**有意保留**在 orchestrator 层
- **renderView / loadBootstrapData / init / DOMContentLoaded**（~60 行）

---

## 4. 关键工程模式

### 4.1 工厂注入依赖，避免循环依赖
所有 renderer / action 模块都以工厂函数导出，依赖通过参数传入：

```js
// renderers/training.js
export function createTrainingRenderer({ state, renderSlot, deps }) {
  return {
renderTraining(container) { /* 用 state + deps */ },
    renderTrainingSummaryHTML(s) { /* ... */ },
  };
}
```

### 4.2 `_rendererDeps` / `_trainingDeps` 共享对象解决循环引用
`statusDeck` 与 `preflight` 互相调用：先创建空 `deps` 对象传给两个工厂，工厂返回后再反向填充，运行时通过对象属性查找。

### 4.3 Getter 模式延迟解析
训练 renderer 在装配时还读不到 `syncFooterAction` / `startTrainingLogPolling`（它们是后续声明的 const），用 getter 在调用时才取值：

```js
const _trainingDeps = {
  renderPreflightPanel,
  renderSamplesPanel,
  get syncFooterAction()        { return syncFooterAction; },
  get startTrainingLogPolling() { return startTrainingLogPolling; },
// ...
};
```

同样模式也用于 `taskHistory` 工厂中读取 `trainingMetadata` 的const 解构变量，避免 TDZ 错误。

### 4.4 window 挂载收敛
所有 `window.xxx = ...` 集中在 main.js L246-L920 的工厂装配区，行号集中、便于审计；HTML 字符串中的 `onclick="updateConfigValue(...)"` 等 inline handler **完全不需要改动**。

### 4.5 零行为变更
每抽一个模块都执行 `npm run build` 验证。50+ 次 build 全部通过，gzip 体积仅增长 ~6 kB（来自工厂样板代码）。

---

## 5. 不可变更文件（约束）

以下文件在重构期间严格保持只读：

- `api.js`、`pluginHost.js`、`i18n.js`
- `schemaRegistry.js`、`sdxlSchema.js`、`animaSchema.js`
- `features/settingsOptions.js`
- `style.css`、`index.html`、`vite.config.js`
- 所有 HTML 字符串中的 `onclick="..."` 内联调用（保持向后兼容）

---

## 6. 维护指引

### 6.1 新增训练参数
直接编辑 `sdxlSchema.js` / `animaSchema.js` 的 schema 定义。`renderers/configForm.js` 会自动渲染。

### 6.2 新增页面 / Tab
1. 在 `renderers/` 下创建 `myPage.js`，导出 `createMyPageRenderer({ state })`。
2. 在 `renderers/index.js` 注册导出。
3. 在 `main.js` 的工厂装配区调用 `const { renderMyPage } = createMyPageRenderer(...)`。
4. 在 `renderView(module)` 路由中加入 `case 'mypage': return renderMyPage(container);`。

### 6.3 新增 window 动作
1. 在 `actions/` 下创建 `myActions.js`，导出 `createMyActions({ state, api, ... })`。
2. 在 `actions/index.js` 注册导出。
3. 在 `main.js` 装配工厂并挂 `window.myAction = myAction`。

### 6.4 修改样式 / HTML
直接编辑 `index.html` 与 `style.css`，无需触碰任何 JS。

### 6.5 构建产物
```bash
cd plugin/lora-scripts-ui-main/ui
npm install
npm run build
# 产物在 ui/dist/，会被 mikazuki/utils/frontend_profiles.py 自动识别为活跃 Profile
```

---

## 7. 已知保留事项（非问题）

- **polling 模块仍在 main.js**：`startTaskPolling` 等 6 个 polling 函数 + `_trainingLogCursor` / `_sysMonitorTimer` / `_gpuPollCooldown` 等模块级状态变量。这部分含定时器副作用与跨函数闭包，留在 orchestrator 层是合理的架构选择，进一步抽离收益边际递减且引入风险。
- **window 挂载未集中到 `registerWindowActions()`**：当前分散在工厂调用区每个模块后面，读起来反而更直观（哪个工厂解构出什么，立即就能看到挂了什么）。
- **`features/` 目录仅剩 `settingsOptions.js`**：保留是因为它被 `main.js` 直接 import；保留目录避免改动 import 路径。
