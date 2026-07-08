# Shopee 定价器 — 浏览器扩展

将批量定价、多站点计算器、站点配置封装为 Chrome / Edge 侧边栏扩展。计算逻辑与默认站点配置与 `shopee-pricing.html` 完全一致。

## 功能

| 标签页 | 说明 |
|--------|------|
| **批量定价** | 单次输入，支持各站点独立设置预估利润，一键计算四站售价 |
| **多站点计算器** | 输入菲律宾售价反推毛利（成本按 0），正向计算马来/新加坡/泰国售价；各站毛利可单独调整 |
| **站点配置** | 费率、境内运费、实时汇率刷新与保存 |

批量定价和多站点计算器均为**单次使用**，无多行表格。泰国站默认费率：佣金 22.47%、提现 0%（其余见 `pricing-core.js`）。

## 安装（Chrome / Edge）

1. 打开 `chrome://extensions/`（Edge：`edge://extensions/`）
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录下的 `extension` 文件夹

## 使用

点击浏览器工具栏中的扩展图标，会在侧边栏打开定价器。

## 文件结构

```
extension/
├── manifest.json       # 扩展配置（Manifest V3）
├── background.js       # 侧边栏行为
├── sidepanel.html      # 主界面
├── styles.css
├── icons/
├── js/
│   ├── pricing-core.js # 计算逻辑（勿改）
│   └── app.js          # 界面交互
```

## 数据存储

配置与汇率保存在扩展页面的 `localStorage` 中（键名 `shopee_sites_v4`、`shopee_fx_rates_v4`），与独立 HTML 文件的数据相互独立。
