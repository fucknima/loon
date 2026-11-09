# Loon 规则订阅

这里的七份规则以 2026-11-09 用户提供的 Loon 缓存为基准，已去除重复文件和 AI 内部的两条重复 Copilot 记录。规则本身**不包含策略**，由 Loon 的订阅配置决定分流方向。

| 规则 | 文件 | 规则数量 | 原订阅策略 |
|---|---|---:|---|
| Apple Intelligence | [AppleIntelligence.list](./AppleIntelligence.list) | 11 | 日本手动策略 |
| GitHub | [GitHub.list](./GitHub.list) | 23 | 香港手动策略 |
| Telegram | [Telegram.lsr](./Telegram.lsr) | 40 | 香港手动策略 |
| TikTok | [TikTok.lsr](./TikTok.lsr) | 83 | 日本手动策略 |
| AI | [AI.lsr](./AI.lsr) | 243 | 日本手动策略 |
| LAN | [LAN_SPLITTER.lsr](./LAN_SPLITTER.lsr) | 9 | DIRECT |
| CN REGION | [REGION_SPLITTER.lsr](./REGION_SPLITTER.lsr) | 1 | DIRECT |

## 订阅地址

- Apple Intelligence：`https://raw.githubusercontent.com/fucknima/loon/main/AppleIntelligence.list`
- GitHub：`https://raw.githubusercontent.com/fucknima/loon/main/GitHub.list`
- Telegram：`https://raw.githubusercontent.com/fucknima/loon/main/Telegram.lsr`
- TikTok：`https://raw.githubusercontent.com/fucknima/loon/main/TikTok.lsr`
- AI：`https://raw.githubusercontent.com/fucknima/loon/main/AI.lsr`
- LAN：`https://raw.githubusercontent.com/fucknima/loon/main/LAN_SPLITTER.lsr`
- CN REGION：`https://raw.githubusercontent.com/fucknima/loon/main/REGION_SPLITTER.lsr`

## Loon 配置示例

请在已有的 `[Remote Rule]` 分区内替换原来同类的订阅地址，不要重复创建分区。已使用这些规则时避免再次添加重复订阅。

```ini
[Remote Rule]
https://raw.githubusercontent.com/fucknima/loon/main/AppleIntelligence.list, policy=日本手动策略, tag=Apple Intelligence, enabled=true
https://raw.githubusercontent.com/fucknima/loon/main/GitHub.list, policy=香港手动策略, tag=GitHub, enabled=true
https://raw.githubusercontent.com/fucknima/loon/main/Telegram.lsr, policy=香港手动策略, tag=Telegram, enabled=true
https://raw.githubusercontent.com/fucknima/loon/main/TikTok.lsr, policy=日本手动策略, tag=TikTok, enabled=true
https://raw.githubusercontent.com/fucknima/loon/main/AI.lsr, policy=日本手动策略, tag=AI, enabled=true
https://raw.githubusercontent.com/fucknima/loon/main/LAN_SPLITTER.lsr, policy=DIRECT, tag=LAN, enabled=true
https://raw.githubusercontent.com/fucknima/loon/main/REGION_SPLITTER.lsr, policy=DIRECT, tag=CN REGION, enabled=true
```

注意：AI 与 GitHub 的 Copilot 域名可能重叠，因策略不同，匹配结果受 Loon 规则顺序影响。LAN、CN REGION 的顺序也应根据你的现有直连/代理要求安排。

以上文件属于 Loon 缓存快照，**不会自动同步第三方规则上游**。仓库中独立的游戏规则、脚本及工具保持不变。
