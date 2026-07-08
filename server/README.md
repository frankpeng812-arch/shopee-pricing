# 物流藏价数据服务

上传 Excel → 自动解析 → 插件拉取 JSON，**无需重新发布扩展**。

## 快速开始

```bash
cd server
pip install -r requirements.txt

# 首次：从 Excel 生成数据文件
python ../scripts/generate_cost_pricing_data.py "/path/to/跨境物流成本.xlsx"

# 启动服务（默认 http://127.0.0.1:8765）
python app.py
```

浏览器打开 **http://127.0.0.1:8765/preview** 核对解析结果，或在页面上传新 Excel。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/shipping-data` | 完整 JSON（插件拉取） |
| GET | `/api/shipping-data/version` | 轻量版本检查 |
| POST | `/admin/upload` | 上传 `.xlsx`（form field: `file`） |
| GET | `/preview` | 可视化核对页 |

## 插件配置

1. 打开扩展 → **站点配置**
2. 「物流藏价数据服务地址」填 `http://127.0.0.1:8765`（或你的服务器地址）
3. 点击「打开核对页」上传新表格，或「立即刷新」

插件启动时会：读本地缓存 → 对比远程版本 → 有更新则自动拉取；失败时使用内置 `cost-pricing-data.js`。

## 部署到公网（可选）

将服务部署到云服务器 / 内网机器后：

1. 在 `extension/manifest.json` 的 `host_permissions` 中加入你的域名，例如：
   `"https://your-domain.com/*"`
2. 在站点配置里把服务地址改为 `https://your-domain.com`
3. 重新加载扩展（仅 manifest 变更需重载一次；**之后更新 Excel 仍无需发版**）

推荐用 nginx 反代 + HTTPS，上传接口建议加鉴权（可在 `app.py` 增加 API Key 校验）。

## 数据流

```
Excel 表格
    ↓ POST /admin/upload
shipping_parser.py 解析
    ↓
server/data/shipping-data.json
    ↓ GET /api/shipping-data
Chrome 插件（缓存到 storage.local）
    ↓
成本定价计算
```

## 本地命令行生成（不发服务）

```bash
python scripts/generate_cost_pricing_data.py ~/Desktop/跨境物流成本（藏价）计算工具+-+20260604.xlsx
```

同时更新 `extension/js/cost-pricing-data.js`（内置兜底）和 `server/data/shipping-data.json`。
