#!/usr/bin/env python3
"""将 server/data/remote-config.json 同步为插件内置 fallback（物流藏价 + 站点默认费率）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REMOTE_CONFIG = ROOT / "server/data/remote-config.json"
JS_SHIPPING = ROOT / "extension/js/cost-pricing-data.js"
JS_SITE_FEES = ROOT / "extension/js/bundled-site-fees.js"
JSON_SHIPPING = ROOT / "server/data/shipping-data.json"


def write_cost_pricing_js(sites: dict) -> None:
    content = (
        "/** 成本定价 — 站点渠道数据（bundled fallback，与 remote-config.json shipping.sites 同步） */\n"
        "const COST_PRICING_SITE_DATA = "
        + json.dumps(sites, ensure_ascii=False, indent=2)
        + ";\n"
    )
    JS_SHIPPING.write_text(content, encoding="utf-8")


def write_bundled_site_fees_js(site_fees: dict) -> None:
    content = (
        "/** 站点默认费率（bundled fallback，与 remote-config.json siteFees 同步） */\n"
        "const BUNDLED_SITE_FEES = "
        + json.dumps(site_fees, ensure_ascii=False, indent=2)
        + ";\n"
    )
    JS_SITE_FEES.write_text(content, encoding="utf-8")


def write_shipping_json(shipping: dict) -> None:
    JSON_SHIPPING.write_text(json.dumps(shipping, ensure_ascii=False, indent=2), encoding="utf-8")


def validate_buyer_fields(sites: dict) -> list[str]:
    missing: list[str] = []
    for site_id, site in sites.items():
        for cargo, channels in (site.get("cargoTypes") or {}).items():
            for ch_name, ch in channels.items():
                for field in ("buyerBaseWeight", "buyerBasePrice", "buyerStepWeight", "buyerStepPrice"):
                    if field not in ch:
                        missing.append(f"{site_id}/{cargo}/{ch_name}: missing {field}")
    return missing


def main() -> None:
    if not REMOTE_CONFIG.exists():
        print(f"✗ 未找到 {REMOTE_CONFIG}", file=sys.stderr)
        sys.exit(1)

    payload = json.loads(REMOTE_CONFIG.read_text(encoding="utf-8"))
    shipping = payload.get("shipping") or {}
    sites = shipping.get("sites") or {}
    site_fees = payload.get("siteFees") or {}

    if not sites:
        print("✗ remote-config.json 缺少 shipping.sites", file=sys.stderr)
        sys.exit(1)
    if not site_fees:
        print("✗ remote-config.json 缺少 siteFees", file=sys.stderr)
        sys.exit(1)

    missing = validate_buyer_fields(sites)
    if missing:
        print("✗ 以下渠道缺少买家运费字段:", file=sys.stderr)
        for line in missing[:20]:
            print(f"  {line}", file=sys.stderr)
        sys.exit(1)

    write_cost_pricing_js(sites)
    write_bundled_site_fees_js(site_fees)
    write_shipping_json({
        "version": shipping.get("checksum") or payload.get("version"),
        "updatedAt": payload.get("updatedAt"),
        "sourceFile": shipping.get("sourceFile"),
        "checksum": shipping.get("checksum"),
        "channelCount": shipping.get("channelCount"),
        "sites": sites,
        "channels": shipping.get("channels") or [],
    })

    channel_count = shipping.get("channelCount") or sum(
        len(chs) for site in sites.values() for chs in (site.get("cargoTypes") or {}).values()
    )
    print(f"✓ {JS_SHIPPING.relative_to(ROOT)}")
    print(f"✓ {JS_SITE_FEES.relative_to(ROOT)}")
    print(f"✓ {JSON_SHIPPING.relative_to(ROOT)}")
    print(f"  {len(sites)} sites, {channel_count} channels, version={payload.get('version')}")


if __name__ == "__main__":
    main()
