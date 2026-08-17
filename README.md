# @dsh-external/dsh-session-slim

DSH（DeepSeek Harness）会话内存/性能优化插件。

## 解决的问题

长推理/长工具输出会产生数万条 `assistant/chunk` 事件，`assistant/message` 还会携带等长的 `sourceEventSeqs` 连续数字数组。这会让浏览器在输出结束后越来越卡，低功耗设备上尤其明显。

本插件从两个层面解决：

1. **运行时插件层（开箱即用）**
   - 历史接口不再把 `sourceEventSeqs` 发给浏览器。
   - 历史接口对已结算 assistant step 裁剪原始 `assistant/chunk`，并用 `stream` 摘要保留 TTFT/吞吐信息。
   - live 帧同样剥离 `sourceEventSeqs`。

2. **核心补丁层（推荐，效果完整）**
   - `sourceEventSeqs` 区间化：密集连续 seq 存成 `{start,end}`，不再写几万个数字。
   - 客户端 live 窗口在最终消息到达后释放已结算 chunk 对象。
   - 这些是 DSH 核心源码改动，通过 `scripts/apply-core-patch.sh` 一键应用。

## 安装

### 1. 运行时插件

```bash
# 在 DSH 中装配本插件（按你的插件安装方式）
dsh plugin --profile web add /path/to/dsh-session-slim
# 或使用注入器：
# dev_build_plugin {"dir": "/path/to/dsh-session-slim"}
# dev_install_package {"dir": "/path/to/dsh-session-slim"}
```

### 2. 核心补丁（强烈推荐）

```bash
cd /path/to/dsh-session-slim
bash scripts/apply-core-patch.sh /path/to/deepseek-harness
```

应用后重新构建 DSH：

```bash
cd /path/to/deepseek-harness
pnpm build
pnpm dsh web
```

## 验证效果

在问题 session 上模拟历史页：

- 历史页事件：102,338 → 130
- 估算 JSON 体积：~17.96 MB → ~0.51 MB

## 说明

- 运行时插件层不修改 DSH 核心，适合不想动源码的用户；但 live 会话的 chunk 释放需要核心补丁。
- 核心补丁是幂等的：已应用时会自动识别并跳过。
- 兼容旧日志：旧日志没有 `stream` 摘要时，历史接口会从 chunk 自动推导，再裁剪。

## License

BSD-3-Clause
