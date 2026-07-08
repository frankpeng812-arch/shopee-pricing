#!/usr/bin/env python3
"""从 Excel 生成 extension/js/cost-pricing-data.js 与 server/data/shipping-data.json"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from shipping_parser import write_all_outputs  # noqa: E402


def main() -> None:
    xlsx = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path.home() / "Desktop/跨境物流成本（藏价）计算工具+-+20260604.xlsx"
    )
    js_out = ROOT / "extension/js/cost-pricing-data.js"
    json_out = ROOT / "server/data/shipping-data.json"
    remote_out = ROOT / "server/data/remote-config.json"
    site_fees = ROOT / "server/data/site-fees.json"
    result = write_all_outputs(
        xlsx,
        js_path=js_out,
        shipping_json_path=json_out,
        remote_config_path=remote_out,
        site_fees_path=site_fees,
    )
    # 确保 bundled-site-fees.js 与 remote-config 一致
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "scripts/sync_bundled_from_remote_config.py")], check=True)
    payload = result["shipping"]
    print(f"✓ {js_out.name} + {json_out.name} + {remote_out.name}")
    print(f"  {len(payload['sites'])} sites, {payload['channelCount']} channels, version={payload['version']}")


if __name__ == "__main__":
    main()
