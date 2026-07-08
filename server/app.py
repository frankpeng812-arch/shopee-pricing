#!/usr/bin/env python3
"""
跨境物流藏价数据服务

用法:
  pip install -r requirements.txt
  python app.py

接口:
  GET  /api/shipping-data     插件拉取最新 JSON
  GET  /api/shipping-data/version  仅版本号（轻量检查）
  POST /admin/upload          上传新 Excel（multipart: file）
  GET  /preview               可视化核对页
  GET  /du-activation         派件催取激活码生成页
  POST /api/delivery-urge/activation-code  根据凭证号生成激活码
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from shipping_parser import parse_shipping_excel, write_outputs  # noqa: E402
from generate_du_activation_code import sign_credential  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_FILE = DATA_DIR / "shipping-data.json"
UPLOAD_DIR = DATA_DIR / "uploads"
PREVIEW_HTML = Path(__file__).resolve().parent / "preview.html"
DU_ACTIVATION_HTML = Path(__file__).resolve().parent / "du-activation-generator.html"
DU_LICENSE_PRIVATE_KEY = ROOT / "scripts" / "du_license_ed25519_private.pem"


class ActivationCodeRequest(BaseModel):
    deviceId: str


def build_delivery_urge_activation_code(device_id: str) -> str:
    """device_id 为 8 位凭证号。"""
    return sign_credential(device_id, DU_LICENSE_PRIVATE_KEY)

app = FastAPI(title="Shopee Shipping Data Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/extension", StaticFiles(directory=ROOT / "extension"), name="extension")


def load_payload() -> dict:
    if not DATA_FILE.exists():
        raise HTTPException(status_code=404, detail="尚未上传 Excel，请先 POST /admin/upload")
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_from_xlsx(xlsx_bytes: bytes, filename: str) -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    upload_path = UPLOAD_DIR / filename
    upload_path.write_bytes(xlsx_bytes)

    payload = parse_shipping_excel(upload_path)
    payload["sourceFile"] = filename
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    bundled_js = ROOT / "extension/js/cost-pricing-data.js"
    bundled_js.write_text(
        "/** 成本定价 — 站点渠道数据（bundled fallback） */\n"
        "const COST_PRICING_SITE_DATA = "
        + json.dumps(payload["sites"], ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    return payload


@app.get("/api/shipping-data")
def get_shipping_data():
    return JSONResponse(load_payload())


@app.get("/api/shipping-data/version")
def get_version():
    payload = load_payload()
    return {
        "version": payload.get("version"),
        "updatedAt": payload.get("updatedAt"),
        "sourceFile": payload.get("sourceFile"),
        "channelCount": payload.get("channelCount"),
    }


@app.post("/admin/upload")
async def upload_excel(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="请上传 .xlsx 文件")
    content = await file.read()
    if len(content) < 1024:
        raise HTTPException(status_code=400, detail="文件过小，可能不是有效的 Excel")
    payload = save_from_xlsx(content, file.filename)
    return {
        "ok": True,
        "version": payload["version"],
        "updatedAt": payload["updatedAt"],
        "sourceFile": payload["sourceFile"],
        "channelCount": payload["channelCount"],
        "sites": list(payload["sites"].keys()),
        "preview": "/preview",
    }


@app.get("/preview", response_class=HTMLResponse)
def preview_page():
    if PREVIEW_HTML.exists():
        return PREVIEW_HTML.read_text(encoding="utf-8")
    return "<h1>preview.html not found</h1>"


@app.get("/du-activation", response_class=HTMLResponse)
def du_activation_generator_page():
    if DU_ACTIVATION_HTML.exists():
        return DU_ACTIVATION_HTML.read_text(encoding="utf-8")
    return "<h1>du-activation-generator.html not found</h1>"


@app.post("/api/delivery-urge/activation-code")
def generate_delivery_urge_activation_code(payload: ActivationCodeRequest):
    """根据 8 位凭证号生成激活码"""
    try:
        code = build_delivery_urge_activation_code(payload.deviceId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "deviceId": payload.deviceId.strip(), "activationCode": code}


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8765"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
