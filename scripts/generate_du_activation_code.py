#!/usr/bin/env python3
"""
派件异常催取 — Ed25519 激活码生成工具（与 extension/js/delivery-urge-license.js 验签一致）

激活码格式：8位凭证号-Ed25519签名(Base64Url)，约 95 字符
示例：1999CF24-xK9mP2vQ7nR4wL8hT3jF6sA1bC0dE5gU9yZ2nM4pH7kQ1rS8tV3wX6yZ0aB

用法:
  python scripts/generate_du_activation_code.py <credential_id>

私钥默认读取 scripts/du_license_ed25519_private.pem
也可通过环境变量 DU_LICENSE_PRIVATE_KEY 指定路径。
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PRIVATE_KEY = ROOT / "du_license_ed25519_private.pem"
SIGN_SCRIPT = ROOT / "sign_du_activation.mjs"
DU_CREDENTIAL_LEN = 8


def normalize_credential_id(raw: str) -> str:
    normalized = raw.strip().upper()
    if not normalized:
        raise ValueError("credential_id is required")
    if len(normalized) < DU_CREDENTIAL_LEN:
        raise ValueError(f"credential_id must be at least {DU_CREDENTIAL_LEN} chars")
    return normalized[:DU_CREDENTIAL_LEN]


def sign_credential(credential_id: str, private_key_path: Path) -> str:
    public_id = normalize_credential_id(credential_id)
    if not private_key_path.is_file():
        raise FileNotFoundError(f"private key not found: {private_key_path}")
    if not SIGN_SCRIPT.is_file():
        raise FileNotFoundError(f"sign script not found: {SIGN_SCRIPT}")

    proc = subprocess.run(
        ["node", str(SIGN_SCRIPT), public_id, str(private_key_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(stderr or "activation sign failed")
    code = proc.stdout.strip()
    if not code.startswith(public_id + "-"):
        raise RuntimeError("unexpected activation code output")
    return code


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 1

    credential_id = sys.argv[1].strip()
    key_path = Path(os.environ.get("DU_LICENSE_PRIVATE_KEY", str(DEFAULT_PRIVATE_KEY)))

    try:
        public_id = normalize_credential_id(credential_id)
        code = sign_credential(credential_id, key_path)
    except (ValueError, FileNotFoundError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"credential_id: {public_id}")
    print(f"activation_code: {code}")
    print(f"code_length: {len(code)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
