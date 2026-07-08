#!/usr/bin/env python3
"""
本地解析 Excel 并生成核对页 + 统一远程配置包

用法:
  python3 scripts/review_shipping.py ~/Desktop/跨境物流成本.xlsx --open
  python3 scripts/review_shipping.py ~/Desktop/xxx.xlsx --fees server/data/site-fees.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from shipping_parser import write_all_outputs  # noqa: E402

REVIEW_HTML = ROOT / "server/review/shipping-review.html"
SHIPPING_JSON = ROOT / "server/data/shipping-data.json"
REMOTE_CONFIG = ROOT / "server/data/remote-config.json"
SITE_FEES = ROOT / "server/data/site-fees.json"
JS_OUT = ROOT / "extension/js/cost-pricing-data.js"

SITE_NAMES = {
    "SG": "新加坡", "MY": "马来西亚", "TH": "泰国", "PH": "菲律宾",
    "VN": "越南", "TW": "台湾", "BR": "巴西", "MX": "墨西哥", "AR": "阿根廷",
}


def build_review_html(payload: dict) -> str:
    data_json = json.dumps(payload, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>物流藏价核对 — {payload.get("sourceFile", "")}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f7fa; color: #333; }}
    .wrap {{ max-width: 1280px; margin: 0 auto; padding: 20px 16px 48px; }}
    h1 {{ margin: 0 0 6px; font-size: 1.35rem; }}
    .meta {{ color: #666; font-size: 0.85rem; margin-bottom: 14px; line-height: 1.6; }}
    .steps {{ background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 14px; margin-bottom: 14px; font-size: 0.85rem; line-height: 1.7; }}
    .steps ol {{ margin: 8px 0 0 20px; padding: 0; }}
    .steps code {{ background: #f5f5f5; padding: 1px 5px; border-radius: 4px; font-size: 0.82rem; }}
    .toolbar {{ display: flex; flex-wrap: wrap; gap: 8px; background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 12px; margin-bottom: 12px; }}
    .toolbar input, .toolbar select {{ padding: 7px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.88rem; }}
    .toolbar input {{ flex: 1; min-width: 160px; }}
    .stat {{ margin-left: auto; font-size: 0.82rem; color: #888; align-self: center; }}
    table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); font-size: 0.82rem; }}
    th, td {{ padding: 8px 10px; border-bottom: 1px solid #f0f0f0; text-align: left; vertical-align: top; }}
    th {{ background: #fafafa; position: sticky; top: 0; z-index: 1; }}
    tr:hover td {{ background: #fffaf8; }}
    .tag {{ display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; }}
    .tag-air {{ background: #e3f2fd; color: #1565c0; }}
    .tag-sea {{ background: #e0f2f1; color: #00695c; }}
    .tag-pickup {{ background: #f3e5f5; color: #7b1fa2; }}
    .mono {{ font-family: ui-monospace, Menlo, monospace; font-size: 0.78rem; }}
    .raw {{ color: #999; font-size: 0.75rem; }}
    .site-head td {{ background: #fff3ef; font-weight: 700; color: #c0392b; border-top: 2px solid #ee4d2d; }}
    .btns {{ margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }}
    .btn {{ padding: 8px 14px; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.85rem; }}
    .btn-primary {{ background: #ee4d2d; color: #fff; border-color: #ee4d2d; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>物流藏价规则核对</h1>
    <div class="meta" id="meta"></div>
    <div class="steps">
      <strong>核对无误后（开发者发布）</strong>
      <ol>
        <li>运行 <code>bash scripts/publish_shipping_github.sh</code></li>
        <li>所有用户插件将自动拉取最新 <code>remote-config.json</code>（含物流渠道 + 站点默认费率）</li>
      </ol>
    </div>
    <div class="toolbar">
      <select id="filterSite"><option value="">全部站点</option></select>
      <select id="filterCargo"><option value="">全部货品</option></select>
      <select id="filterType"><option value="">全部类型</option><option value="air">空运</option><option value="sea">海运</option><option value="pickup">自提</option></select>
      <input type="search" id="filterText" placeholder="搜索渠道…">
      <span class="stat" id="stat"></span>
    </div>
    <div class="btns">
      <button class="btn btn-primary" id="btnJson">下载 JSON</button>
    </div>
    <table style="margin-top:14px">
      <thead><tr><th>站点</th><th>货品</th><th>渠道</th><th>类型</th><th>藏价规则</th><th>买家运费</th><th>表格原文</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <script>
    const PAYLOAD = {data_json};
    const SITE_NAMES = {json.dumps(SITE_NAMES, ensure_ascii=False)};
    const TYPE_LABEL = {{ air: "空运", sea: "海运", pickup: "自提" }};
    const channels = PAYLOAD.channels || [];
    document.getElementById("meta").textContent =
      `来源：${{PAYLOAD.sourceFile}} · 渠道 ${{PAYLOAD.channelCount}} 条 · 版本 ${{PAYLOAD.version}}`;
    function render() {{
      const site = document.getElementById("filterSite").value;
      const cargo = document.getElementById("filterCargo").value;
      const type = document.getElementById("filterType").value;
      const q = document.getElementById("filterText").value.trim().toLowerCase();
      const rows = channels.filter(c => (!site||c.site===site) && (!cargo||c.cargo===cargo) && (!type||c.type===type) && (!q||(c.display+c.label+c.site).toLowerCase().includes(q)));
      document.getElementById("stat").textContent = `显示 ${{rows.length}} / ${{channels.length}} 条`;
      let lastSite = "";
      document.getElementById("tbody").innerHTML = rows.map(c => {{
        const head = c.site !== lastSite ? `<tr class="site-head"><td colspan="7">${{SITE_NAMES[c.site]||c.site}} (${{c.site}})</td></tr>` : "";
        lastSite = c.site;
        const tag = c.type === "sea" ? "tag-sea" : c.type === "pickup" ? "tag-pickup" : "tag-air";
        return head + `<tr><td>${{c.site}}</td><td>${{c.cargo}}</td><td>${{(c.display||c.label).replace(/\\n/g,"<br>")}}</td><td><span class="tag ${{tag}}">${{TYPE_LABEL[c.type]||c.type}}</span></td><td class="mono">${{c.ruleSummary||""}}</td><td class="mono">${{c.buyerRuleSummary||"—"}}</td><td class="raw">${{c.rawBase||"—"}}<br>${{c.rawStep||"—"}}<br>${{c.rawBuyerBase||"—"}}<br>${{c.rawBuyerStep||"—"}}</td></tr>`;
      }}).join("");
    }}
    [...new Set(channels.map(c=>c.site))].sort().forEach(s => {{ document.getElementById("filterSite").innerHTML += `<option value="${{s}}">${{SITE_NAMES[s]||s}}</option>`; }});
    [...new Set(channels.map(c=>c.cargo))].forEach(c => {{ document.getElementById("filterCargo").innerHTML += `<option value="${{c}}">${{c}}</option>`; }});
    ["filterSite","filterCargo","filterType"].forEach(id => document.getElementById(id).addEventListener("change", render));
    document.getElementById("filterText").addEventListener("input", render);
    document.getElementById("btnJson").onclick = () => {{ const b=new Blob([JSON.stringify(PAYLOAD,null,2)],{{type:"application/json"}}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="shipping-data.json"; a.click(); }};
    render();
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="解析 Excel 并生成远程配置包")
    parser.add_argument("xlsx", type=Path, help="Excel 文件路径")
    parser.add_argument("--open", action="store_true", help="解析完成后打开核对页")
    parser.add_argument("--fees", type=Path, default=SITE_FEES, help="站点费率 JSON 路径")
    parser.add_argument("--export", type=Path, nargs="?", const=Path.home() / "Desktop/remote-config.json",
                        dest="export_path", help="复制 remote-config.json 到指定路径")
    args = parser.parse_args()

    if not args.xlsx.exists():
        print(f"✗ 文件不存在: {args.xlsx}", file=sys.stderr)
        sys.exit(1)

    result = write_all_outputs(
        args.xlsx,
        js_path=JS_OUT,
        shipping_json_path=SHIPPING_JSON,
        remote_config_path=REMOTE_CONFIG,
        site_fees_path=args.fees,
    )
    shipping = result["shipping"]
    remote = result["remoteConfig"]

    REVIEW_HTML.parent.mkdir(parents=True, exist_ok=True)
    REVIEW_HTML.write_text(build_review_html(shipping), encoding="utf-8")

    if args.export_path is not None:
        shutil.copy2(REMOTE_CONFIG, args.export_path)
        print(f"✓ 已复制 remote-config.json → {args.export_path}")

    print()
    print("=" * 56)
    print("  解析完成，请核对")
    print("=" * 56)
    print(f"  渠道: {shipping['channelCount']}  远程包版本: {remote['version']}")
    print(f"  核对页:   {REVIEW_HTML}")
    print(f"  远程包:   {REMOTE_CONFIG}")
    print(f"  站点费率: {args.fees}")
    print()
    print("  核对无误后: bash scripts/publish_shipping_github.sh")
    print()

    if args.open:
        webbrowser.open(REVIEW_HTML.as_uri())


if __name__ == "__main__":
    main()
