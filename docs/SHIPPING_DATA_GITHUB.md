# 远程配置发布指南（开发者）

用户**无需任何配置**。你在 GitHub 推送 `remote-config.json` 后，所有已安装插件会自动更新。

## 远程包内容

`server/data/remote-config.json` 包含：

| 模块 | 说明 |
|------|------|
| `shipping.sites` | 各站点物流渠道藏价（首重/续重） |
| `siteFees` | 各站点默认佣金、交易费、活动费、提现费、境内运费 |

## 发布流程

### 1. 解析 Excel + 核对

```bash
python3 scripts/review_shipping.py ~/Desktop/跨境物流成本.xlsx --open
```

### 2. 修改站点默认费率（可选）

编辑 `server/data/site-fees.json`，然后重新运行上面的命令。

### 3. 推送到 GitHub

```bash
bash scripts/publish_shipping_github.sh
```

### 4. 配置插件内置地址（仅发布插件时做一次）

编辑 `extension/js/remote-config.js`，将 `REPLACE_GITHUB_USER` 换成你的 GitHub 用户名：

```javascript
const REMOTE_CONFIG_URL =
  "https://raw.githubusercontent.com/你的用户名/shopee-pricing/main/server/data/remote-config.json";
```

然后打包/发布 Chrome 扩展。**之后只 push JSON，不用重新发版。**

## 用户侧行为

- 打开插件 → 自动拉取 `remote-config.json`
- 对比本地缓存版本号 → 有更新则应用
- 站点配置页显示只读同步状态（无 URL 输入框）
- 用户若在站点配置里改过费率，**本地修改优先**；远程更新只影响默认值

## 更新频率建议

| 内容 | 操作 |
|------|------|
| 物流 Excel 变更 | `review_shipping.py` → `publish_shipping_github.sh` |
| 默认费率变更 | 改 `site-fees.json` → 同上 |
| 首次上架 / 换仓库 | 改 `remote-config.js` 里的 URL → 重新发布插件 |
