#!/usr/bin/env python3
"""解析跨境物流成本 Excel → 站点/渠道藏价规则 JSON"""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

SITE_META: dict[str, dict[str, Any]] = {
    "SG": {"name": "新加坡", "currency": "S$", "currencyCode": "SGD", "css": "sg", "exchangeRate": 0.19, "commission": 0.16, "transaction": 0.03},
    "MY": {"name": "马来西亚", "currency": "RM", "currencyCode": "MYR", "css": "my", "exchangeRate": 0.64, "commission": 0.1836, "transaction": 0.0378},
    "TH": {"name": "泰国", "currency": "฿", "currencyCode": "THB", "css": "th", "exchangeRate": 5.0, "commission": 0.2247, "transaction": 0.0321},
    "PH": {"name": "菲律宾", "currency": "₱", "currencyCode": "PHP", "css": "ph", "exchangeRate": 8.0, "commission": 0.12, "transaction": 0.0224},
    "VN": {"name": "越南", "currency": "₫", "currencyCode": "VND", "css": "vn", "exchangeRate": 3500, "commission": 0.12, "transaction": 0.03},
    "TW": {"name": "台湾", "currency": "NT$", "currencyCode": "TWD", "css": "tw", "exchangeRate": 4.5, "commission": 0.12, "transaction": 0.03},
    "BR": {"name": "巴西", "currency": "R$", "currencyCode": "BRL", "css": "br", "exchangeRate": 0.78, "commission": 0.14, "transaction": 0.03},
    "MX": {"name": "墨西哥", "currency": "MX$", "currencyCode": "MXN", "css": "mx", "exchangeRate": 2.5, "commission": 0.12, "transaction": 0.03},
    "AR": {"name": "阿根廷", "currency": "AR$", "currencyCode": "ARS", "css": "ar", "exchangeRate": 200, "commission": 0.12, "transaction": 0.03},
}

SITE_PATTERNS = [
    ("新加坡", "SG"), ("马来西亚", "MY"), ("泰国", "TH"), ("菲律宾", "PH"),
    ("越南", "VN"), ("台湾", "TW"), ("巴西", "BR"), ("墨西哥", "MX"), ("阿根廷", "AR"),
]

SG_SEA_CHANNEL = {
    "site": "SG", "cargo": "普货",
    "display": "Doorstep Delivery (Sea Shipping)\n(海运渠道)",
    "label": "海运渠道", "type": "sea",
    "baseWeight": 2000, "basePrice": 3.4, "stepWeight": 1000, "stepPrice": 0.4,
    "buyerBaseWeight": 0.0, "buyerBasePrice": 0.0, "buyerStepWeight": 0.0, "buyerStepPrice": 0.0,
    "rawBase": "≤2000g: 3.4", "rawStep": ">2000g: 0.4 / 1000g",
    "rawBuyerBase": "", "rawBuyerStep": "",
    "ruleSummary": "≤2000g: 3.4；>2000g: 0.4 / 1000g",
    "buyerRuleSummary": "—",
}


def parse_tiered_step(step_cell: str) -> tuple[float, float] | None:
    step_cell = str(step_cell).strip()
    if not step_cell or step_cell == "nan":
        return None
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)\s*[gG克]", step_cell)
    if matches:
        sp, sw = matches[-1]
        return float(sw), float(sp)
    matches = re.findall(
        r">\s*(\d+(?:\.\d+)?)\s*[gG克].*?(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)\s*[gG克]",
        step_cell,
    )
    if matches:
        _, sp, sw = matches[-1]
        return float(sw), float(sp)
    return None


def infer_base_weight_from_step(step_cell: str) -> float | None:
    m = re.search(r">\s*(\d+(?:\.\d+)?)\s*[gG克]", str(step_cell))
    return float(m.group(1)) if m else None


def parse_price(base_cell: str, step_cell: str) -> dict[str, float] | None:
    base_cell = str(base_cell).strip()
    step_cell = str(step_cell).strip()
    if base_cell in ("", "nan", "-"):
        return None

    m = re.search(r"^(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)\s*[gG克]", base_cell)
    if m:
        bp, bw = float(m.group(1)), float(m.group(2))
        tier = parse_tiered_step(step_cell)
        sw, sp = tier if tier else (bw, bp)
        return {"baseWeight": bw, "basePrice": bp, "stepWeight": sw, "stepPrice": sp}

    m = re.search(r"[≤<=≤]\s*(\d+(?:\.\d+)?)\s*[gG克].*?[:：]\s*(\d+(?:\.\d+)?)", base_cell)
    if m:
        bw, bp = float(m.group(1)), float(m.group(2))
        tier = parse_tiered_step(step_cell)
        sw, sp = tier if tier else (10.0, 0.15)
        return {"baseWeight": bw, "basePrice": bp, "stepWeight": sw, "stepPrice": sp}

    m = re.search(r"^(\d+(?:\.\d+)?)$", base_cell)
    if m:
        bp = float(m.group(1))
        tier = parse_tiered_step(step_cell)
        if tier:
            sw, sp = tier
            inferred = infer_base_weight_from_step(step_cell)
            bw = inferred if inferred is not None else (500.0 if bp == 0 else 10.0)
            return {"baseWeight": bw, "basePrice": bp, "stepWeight": sw, "stepPrice": sp}
        return {"baseWeight": 10.0, "basePrice": bp, "stepWeight": 10.0, "stepPrice": 0.0}

    return None


def channel_type(ch: str, ch_cn: str) -> str:
    low = (ch + ch_cn).lower()
    if "sea shipping" in low or "海运" in ch_cn or "海運" in ch_cn:
        return "sea"
    if any(k in low or k in ch_cn for k in (
        "pickup", "locker", "collection", "自取", "自提", "711", "7-11",
        "全家", "店到店", "萊爾富", "OK MART",
    )):
        return "pickup"
    return "air"


def detect_site(site_cell: str) -> str | None:
    for name, code in SITE_PATTERNS:
        if name in site_cell:
            return code
    return None


def format_rule_summary(rule: dict[str, float]) -> str:
    bw, bp = rule["baseWeight"], rule["basePrice"]
    sw, sp = rule["stepWeight"], rule["stepPrice"]
    if not sp:
        return f"固定 {bp:g}"
    return f"≤{bw:g}g: {bp:g}；>{bw:g}g: {sp:g} / {sw:g}g"


def parse_buyer_rule(base_cell: str, step_cell: str) -> dict[str, float] | None:
    base_cell = str(base_cell).strip()
    step_cell = str(step_cell).strip()
    if base_cell in ("", "nan", "-"):
        return None
    return parse_price(base_cell, step_cell)


def buyer_rule_to_fields(rule: dict[str, float] | None) -> dict[str, float]:
    if not rule:
        return {
            "buyerBaseWeight": 0.0,
            "buyerBasePrice": 0.0,
            "buyerStepWeight": 0.0,
            "buyerStepPrice": 0.0,
        }
    return {
        "buyerBaseWeight": rule["baseWeight"],
        "buyerBasePrice": rule["basePrice"],
        "buyerStepWeight": rule["stepWeight"],
        "buyerStepPrice": rule["stepPrice"],
    }


def parse_shipping_excel(xlsx_path: Path) -> dict[str, Any]:
    df = pd.read_excel(xlsx_path, sheet_name="物流成本价格详解", header=None)
    current_site: str | None = None
    current_cargo = "普货"
    entries: list[dict[str, Any]] = []
    last_pricing: dict[tuple[str, str], dict[str, float]] = {}

    for _, row in df.iterrows():
        cells = [str(c).strip() if pd.notna(c) else "" for c in row]
        site_cell, channel_cell, zone_cell = cells[1], cells[2], cells[3]
        base_cell, step_cell = cells[4], cells[6]
        buyer_base_cell = cells[7] if len(cells) > 7 else ""
        buyer_step_cell = cells[8] if len(cells) > 8 else ""
        joined = " ".join(cells)

        if "重货价格表" in joined:
            current_cargo = "重货"
            continue
        if "默认价格表" in joined:
            current_cargo = "普货"
            continue
        if "特货价格表" in joined:
            current_cargo = "特货"
            continue

        detected = detect_site(site_cell)
        if detected:
            current_site = detected

        if not channel_cell or channel_cell in ("渠道", "物流方案", "-", "nan"):
            continue
        if any(x in str(base_cell) for x in ("海运渠道藏价", "小于等于30kg", "30kg以上", "按体积藏价")):
            continue
        if not current_site:
            continue

        rule = parse_price(base_cell, step_cell)
        if rule:
            last_pricing[(current_site, current_cargo)] = rule
        elif current_site == "TW" and channel_cell.startswith("蝦皮海外"):
            inherited = last_pricing.get((current_site, current_cargo))
            if inherited:
                rule = dict(inherited)
            else:
                continue
        else:
            continue

        ch_parts = channel_cell.split("\n")
        ch = ch_parts[0].strip()
        ch_cn = re.sub(r"^[（(]|[)）]$", "", ch_parts[1].strip()) if len(ch_parts) > 1 else ""
        if current_site == "TW":
            display = ch
            label = ch
        else:
            display = ch + (f"\n({ch_cn})" if ch_cn else "")
            label = ch_cn or ch.split("(")[0].strip()
        if zone_cell and zone_cell not in ("-", "", "nan"):
            display += f" [{zone_cell}]"

        buyer_rule = parse_buyer_rule(buyer_base_cell, buyer_step_cell)

        entries.append({
            "site": current_site,
            "cargo": current_cargo,
            "display": display,
            "label": label,
            "type": channel_type(ch, ch_cn),
            "rawBase": base_cell,
            "rawStep": step_cell,
            "rawBuyerBase": buyer_base_cell,
            "rawBuyerStep": buyer_step_cell,
            "ruleSummary": format_rule_summary(rule),
            "buyerRuleSummary": format_rule_summary(buyer_rule) if buyer_rule else "—",
            **rule,
            **buyer_rule_to_fields(buyer_rule),
        })

    entries.append({**SG_SEA_CHANNEL})

    seen: set[tuple[str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for e in entries:
        key = (e["site"], e["cargo"], e["display"])
        if key not in seen:
            seen.add(key)
            unique.append(e)

    by_site: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(dict))
    for e in unique:
        by_site[e["site"]][e["cargo"]][e["display"]] = {
            "type": e["type"],
            "label": e["label"],
            "baseWeight": e["baseWeight"],
            "basePrice": e["basePrice"],
            "stepWeight": e["stepWeight"],
            "stepPrice": e["stepPrice"],
            "buyerBaseWeight": e["buyerBaseWeight"],
            "buyerBasePrice": e["buyerBasePrice"],
            "buyerStepWeight": e["buyerStepWeight"],
            "buyerStepPrice": e["buyerStepPrice"],
        }

    sites: dict[str, Any] = {}
    for site_id, cargo_map in sorted(by_site.items()):
        meta = {**SITE_META.get(site_id, {}), "fssRate": 0.04, "ccbRate": 0.03}
        sites[site_id] = {**meta, "cargoTypes": dict(cargo_map)}

    file_bytes = xlsx_path.read_bytes()
    checksum = hashlib.sha256(file_bytes).hexdigest()[:16]

    return {
        "version": checksum,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceFile": xlsx_path.name,
        "checksum": checksum,
        "channelCount": len(unique),
        "sites": sites,
        "channels": unique,
    }


def payload_to_js_module(payload: dict[str, Any]) -> str:
    return (
        "/** 成本定价 — 站点渠道数据（bundled fallback） */\n"
        "const COST_PRICING_SITE_DATA = "
        + json.dumps(payload["sites"], ensure_ascii=False, indent=2)
        + ";\n"
    )


def load_site_fees(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"站点费率文件不存在: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def build_remote_config(shipping_payload: dict[str, Any], site_fees: dict[str, Any]) -> dict[str, Any]:
    combined = json.dumps(
        {"shipping": shipping_payload.get("checksum"), "siteFees": site_fees},
        sort_keys=True,
        ensure_ascii=False,
    )
    version = hashlib.sha256(combined.encode("utf-8")).hexdigest()[:16]
    return {
        "version": version,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "shipping": {
            "sourceFile": shipping_payload.get("sourceFile"),
            "checksum": shipping_payload.get("checksum"),
            "channelCount": shipping_payload.get("channelCount"),
            "sites": shipping_payload.get("sites"),
            "channels": shipping_payload.get("channels"),
        },
        "siteFees": site_fees,
    }


def write_all_outputs(
    xlsx_path: Path,
    *,
    js_path: Path,
    shipping_json_path: Path,
    remote_config_path: Path,
    site_fees_path: Path,
) -> dict[str, Any]:
    shipping_payload = parse_shipping_excel(xlsx_path)
    site_fees = load_site_fees(site_fees_path)
    remote_config = build_remote_config(shipping_payload, site_fees)

    js_path.parent.mkdir(parents=True, exist_ok=True)
    js_path.write_text(payload_to_js_module(shipping_payload), encoding="utf-8")

    shipping_json_path.parent.mkdir(parents=True, exist_ok=True)
    shipping_json_path.write_text(json.dumps(shipping_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    remote_config_path.parent.mkdir(parents=True, exist_ok=True)
    remote_config_path.write_text(json.dumps(remote_config, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"shipping": shipping_payload, "remoteConfig": remote_config}


def write_outputs(xlsx_path: Path, js_path: Path | None = None, json_path: Path | None = None) -> dict[str, Any]:
    payload = parse_shipping_excel(xlsx_path)
    if js_path:
        js_path.parent.mkdir(parents=True, exist_ok=True)
        js_path.write_text(payload_to_js_module(payload), encoding="utf-8")
    if json_path:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload
