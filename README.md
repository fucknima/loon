# Loon 规则订阅

## GitHub 代理规则

- 文件：[GitHub.list](./GitHub.list)
- 订阅地址：`https://raw.githubusercontent.com/fucknima/loon/main/GitHub.list`
- 作用：GitHub 网站与 API、GitHub Raw/Release、静态资源、GitHub Packages、Copilot 等常用域名。

### 在 Loon 中使用

Loon → 配置 → 规则 → 远程规则 → 添加订阅，填入上面的 URL，策略选择自己已有的代理节点或策略组。

也可以在主配置文件的 **[Remote Rule]** 节内增加以下一行（如你的策略组不叫 `PROXY`，请替换为真实名称）：

```ini
[Remote Rule]
https://raw.githubusercontent.com/fucknima/loon/main/GitHub.list, policy=PROXY, tag=GitHub, enabled=true
```

**注意：** 如果现有配置已经有 `[Remote Rule]`，只添加 URL 那一行，勿创建重复配置段。把 GitHub 规则放在宽泛的直连规则之前，避免被前面的规则优先命中。远程规则文件内不写 `PROXY` 或 `DIRECT`，由订阅条目指定。

修改 `GitHub.list` 并推送到 `main` 后，订阅地址保持不变；在 Loon 更新远程规则即可读取新版本。

此规则针对 GitHub 相关域名，不会将整个 AWS / Microsoft 域名空间代理，也不保证覆盖通过第三方下载站或其他 CDN 的跳转资源。
