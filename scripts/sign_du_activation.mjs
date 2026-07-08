#!/usr/bin/env node
/**
 * Ed25519 激活码签名（与 extension/js/delivery-urge-license.js 验签一致）
 * 用法: node scripts/sign_du_activation.mjs <credential_id> [private_key_pem]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPrivateKey, sign } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_KEY = path.join(__dirname, "du_license_ed25519_private.pem");
const CREDENTIAL_LEN = 8;

function normalizeCredentialId(raw) {
  const normalized = String(raw || "").trim().toUpperCase();
  if (normalized.length < CREDENTIAL_LEN) {
    throw new Error(`credential_id must be at least ${CREDENTIAL_LEN} chars`);
  }
  return normalized.slice(0, CREDENTIAL_LEN);
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function signCredential(credentialId, privateKeyPath = DEFAULT_KEY) {
  const publicId = normalizeCredentialId(credentialId);
  const pem = fs.readFileSync(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(pem);
  const signature = sign(null, Buffer.from(publicId, "utf8"), privateKey);
  return `${publicId}-${toBase64Url(signature)}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const credentialId = process.argv[2];
  const keyPath = process.argv[3] || process.env.DU_LICENSE_PRIVATE_KEY || DEFAULT_KEY;
  if (!credentialId) {
    console.error("usage: node scripts/sign_du_activation.mjs <credential_id> [private_key_pem]");
    process.exit(1);
  }
  try {
    console.log(signCredential(credentialId, keyPath));
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(1);
  }
}
