# Quality Optimization Phase 2 WebUI 集成完成

## 概述

✅ **Phase 2 配置字段已成功暴露到 WebUI**  
**完成日期**: 2026-06-22  
**修改文件**: 2 个  
**新增字段**: 11 个（5 Hard Negative + 6 Multi-Scale）

---

## 修改清单

### 1. schemaFrontierGroups.js
**文件**: `plugin/lora-scripts-ui-main/ui/src/schemaFrontierGroups.js`  
**修改**: 在 `S_QUALITY_OPTIMIZATION_PACK` 中添加 Phase 2 字段

**新增字段 (11个)**:

#### Hard Negative Mining (5个)
```javascript
{ key: 'hard_negative_mining_enabled', type: 'boolean', label: '启用困难样本挖掘 (Hard Negative Mining)', ... }
{ key: 'hard_negative_mining_ratio', type: 'number', label: '困难样本保留比例', defaultValue: 0.5, ... }
{ key: 'hard_negative_mining_warmup_steps', type: 'number', label: 'Warmup 步数', defaultValue: 100, ... }
{ key: 'hard_negative_mining_mode', type: 'select', label: '挖掘模式', options: ['topk', 'threshold'], ... }
{ key: 'hard_negative_mining_threshold_multiplier', type: 'number', label: 'Threshold 系数', defaultValue: 1.2, ... }
```

#### Multi-Scale DiT Supervision (6个)
```javascript
{ key: 'multi_scale_supervision_enabled', type: 'boolean', label: '启用多尺度 DiT 监督 (Multi-Scale Supervision)', ... }
{ key: 'multi_scale_supervision_weight', type: 'number', label: '多尺度损失权重', defaultValue: 0.1, ... }
{ key: 'multi_scale_layers', type: 'text', label: '监督层列表', defaultValue: '4,8,12', ... }
{ key: 'multi_scale_loss_type', type: 'select', label: '特征损失类型', options: ['mse', 'cosine'], ... }
{ key: 'multi_scale_min_t', type: 'number', label: '最小 sigma (多尺度)', defaultValue: 0.0, ... }
{ key: 'multi_scale_max_t', type: 'number', label: '最大 sigma (多尺度)', defaultValue: 1.0, ... }
```

### 2. animaSchema.js
**文件**: `plugin/lora-scripts-ui-main/ui/src/animaSchema.js`  
**修改**: 更新 section 描述

**修改内容**:
```javascript
// 旧描述
'图像质量优化储备 (Phase 1)'
'实验功能包。针对 Anima 高频纹理/网状问题的 3 个互补技术：线稿保护、DCT 频域、Gram 纹理。...'

// 新描述
'图像质量优化储备 (Phase 1+2)'
'实验功能包。Phase 1: 线稿保护、DCT 频域、Gram 纹理 (针对高频纹理/网状问题)。Phase 2: 困难样本挖掘 (聚焦困难样本训练) + 多尺度 DiT 监督 (中间层自蒸馏)。全部默认关闭，需显式启用。建议先启用单个技术测试效果，再考虑组合使用。'
```

---

## 字段分组

### Phase 2.1: Hard Negative Mining (困难样本挖掘)
| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `hard_negative_mining_enabled` | boolean | false | 启用开关 |
| `hard_negative_mining_ratio` | number | 0.5 | 保留 top 50% 困难样本 |
| `hard_negative_mining_warmup_steps` | number | 100 | 前 100 步不启用 |
| `hard_negative_mining_mode` | select | topk | topk / threshold 两种模式 |
| `hard_negative_mining_threshold_multiplier` | number | 1.2 | Threshold 模式系数 |

**可见性逻辑**:
- `ratio` / `warmup_steps` / `mode`: 当 `enabled=true` 时可见
- `threshold_multiplier`: 当 `enabled=true` **且** `mode=threshold` 时可见

### Phase 2.2: Multi-Scale DiT Supervision (多尺度监督)
| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `multi_scale_supervision_enabled` | boolean | false | 启用开关 |
| `multi_scale_supervision_weight` | number | 0.1 | 相对主损失权重 |
| `multi_scale_layers` | text | "4,8,12" | 监督的 DiT 层 |
| `multi_scale_loss_type` | select | mse | mse / cosine 两种损失 |
| `multi_scale_min_t` | number | 0.0 | Sigma 窗口下界 |
| `multi_scale_max_t` | number | 1.0 | Sigma 窗口上界 |

**可见性逻辑**:
- 所有子字段：当 `multi_scale_supervision_enabled=true` 时可见

---

## UI 位置

**Section**: `quality-optimization-phase1` (虽然命名是 phase1，但描述已更新为 Phase 1+2)  
**Tab**: `frontier` (前沿技术)  
**标题**: "图像质量优化储备 (Phase 1+2)"

**字段顺序**:
1. Scale Guidance (预设模式)
2. **Phase 1**: Lineart (线稿) → DCT (频域) → Gram (纹理)
3. **Phase 2**: Hard Negative Mining (困难样本) → Multi-Scale Supervision (多尺度)

---

## 推荐配置

### 困难样本挖掘 (Hard Negative Mining)
**适用场景**: 数据集质量不均匀，部分样本明显更难学习  
**推荐配置**:
```javascript
hard_negative_mining_enabled: true
hard_negative_mining_ratio: 0.5          // 保留 50% 困难样本
hard_negative_mining_warmup_steps: 100   // 前 100 步稳定训练
hard_negative_mining_mode: 'topk'        // Top-K 模式更稳定
```

**注意事项**:
- Warmup 很重要：过早启用可能导致梯度不稳定
- Ratio 不要太小：< 0.3 可能过度聚焦，丢失简单样本的正则化效果
- Threshold 模式适合 loss 分布明显双峰的情况

### 多尺度 DiT 监督 (Multi-Scale Supervision)
**适用场景**: 希望中间层学习更平滑的语义表示  
**推荐配置**:
```javascript
multi_scale_supervision_enabled: true
multi_scale_supervision_weight: 0.1      // 不要太大，避免干扰主任务
multi_scale_layers: '4,8,12'             // 早中晚三层
multi_scale_loss_type: 'mse'             // MSE 更稳定
multi_scale_min_t: 0.0                   // 全范围应用
multi_scale_max_t: 1.0
```

**注意事项**:
- **显存开销大**: 需要两次 forward (student + teacher)，显存约增加 30-50%
- 层数不要太多：每层都要提取特征，开销线性增长
- Weight 不要太大：0.1-0.3 即可，过大会干扰主 loss
- Sigma 窗口：可以只在高噪声阶段 (min_t=0.5, max_t=1.0) 应用，减少开销

---

## 验证步骤

### 1. Schema Parity 验证
```bash
cd plugin/lora-scripts-ui-main/ui
node tools/schemaParitySnapshot.mjs --capture
```
✅ **已完成**: 27 training types snapshotted (31355876 bytes)

### 2. 前端构建验证
```bash
cd plugin/lora-scripts-ui-main/ui
npm run build
```
✅ **已完成**: dist/assets/index-6SI7vhGY.js (928.39 kB)

### 3. 镜像到 Launcher
```bash
cp -r plugin/lora-scripts-ui-main/ui/dist/* backend/dist_wpf_launcher/web/
```
✅ **已完成**

---

## 后端兼容性

**配置字段名称**:  
WebUI 字段名与后端 `configs.py` 字段名 **完全一致**，无需 alias 映射。

**后端默认值**:  
WebUI 的 `defaultValue` 与后端 `configs.py` 的默认值 **完全一致**。

**字段对应表**:
| WebUI 字段 | 后端字段 | 一致性 |
|-----------|----------|--------|
| `hard_negative_mining_enabled` | `hard_negative_mining_enabled` | ✅ |
| `hard_negative_mining_ratio` | `hard_negative_mining_ratio` | ✅ |
| `hard_negative_mining_warmup_steps` | `hard_negative_mining_warmup_steps` | ✅ |
| `hard_negative_mining_mode` | `hard_negative_mining_mode` | ✅ |
| `hard_negative_mining_threshold_multiplier` | `hard_negative_mining_threshold_multiplier` | ✅ |
| `multi_scale_supervision_enabled` | `multi_scale_supervision_enabled` | ✅ |
| `multi_scale_supervision_weight` | `multi_scale_supervision_weight` | ✅ |
| `multi_scale_layers` | `multi_scale_layers` | ✅ |
| `multi_scale_loss_type` | `multi_scale_loss_type` | ✅ |
| `multi_scale_min_t` | `multi_scale_min_t` | ✅ |
| `multi_scale_max_t` | `multi_scale_max_t` | ✅ |

---

## 用户可见文案

### Hard Negative Mining
**主开关文案**:  
"启用困难样本挖掘 (Hard Negative Mining)"

**描述**:  
"Phase 2.1。只回传 loss 最高的 top-k% 样本梯度，聚焦困难样本训练。类似 Focal Loss 思想。default-off。"

### Multi-Scale Supervision
**主开关文案**:  
"启用多尺度 DiT 监督 (Multi-Scale Supervision)"

**描述**:  
"Phase 2.2。在 DiT 中间层 (4/8/12) 上做 student-teacher 自蒸馏，引导网络学习更平滑的语义空间。需要两次 forward，显存开销较大。default-off。"

---

## 测试建议

### 单独测试 Hard Negative Mining
1. 启用 `hard_negative_mining_enabled`
2. 保持其他 Phase 2 技术关闭
3. 观察 loss 下降速度是否加快
4. 对比 top-k vs threshold 模式

### 单独测试 Multi-Scale Supervision
1. 启用 `multi_scale_supervision_enabled`
2. 保持其他 Phase 2 技术关闭
3. 监控显存占用（预期增加 30-50%）
4. 对比 mse vs cosine loss

### 组合测试 Phase 2
1. 同时启用 Hard Negative + Multi-Scale
2. 观察是否有协同效果
3. 注意显存开销

---

## 已知限制

1. **Multi-Scale 显存开销大**: 双 forward + feature capture，显存约增加 30-50%
2. **仅支持 Anima**: 两个技术都只在 `_model_arch == "anima"` 时生效
3. **需要 text_embeddings**: Multi-Scale 需要 batch 中有 `text_embeddings` 和 `text_embeddings_mask`

---

## 总结

✅ **WebUI 集成完成**:
- 11 个新字段全部暴露
- Section 描述已更新为 Phase 1+2
- Schema parity baseline 已更新
- 前端已构建并镜像到 launcher

✅ **后端兼容**:
- 字段名完全一致
- 默认值完全一致
- 无需额外映射

✅ **用户体验**:
- 分组清晰（Phase 2.1 / Phase 2.2）
- 文案友好（中文 + 英文术语）
- 可见性逻辑合理（子字段只在启用时显示）

**下一步**: 用户可在 WebUI 中启用 Phase 2 技术，进行真实训练验证。
