#!/usr/bin/env bash
# 核对无误后：提交 remote-config.json 并推送到 GitHub（所有用户插件自动更新）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE="server/data/remote-config.json"
SHIPPING="server/data/shipping-data.json"
FEES="server/data/site-fees.json"
JS="extension/js/cost-pricing-data.js"

if [[ ! -f "$REMOTE" ]]; then
  echo "✗ 未找到 $REMOTE"
  echo "  请先运行: python3 scripts/review_shipping.py ~/Desktop/你的表格.xlsx --open"
  exit 1
fi

echo "即将提交:"
git status --short "$REMOTE" "$SHIPPING" "$FEES" "$JS" 2>/dev/null || true
echo ""

read -r -p "确认提交并推送到 GitHub? [y/N] " ans
if [[ "${ans,,}" != "y" ]]; then
  echo "已取消"
  exit 0
fi

git add "$REMOTE" "$SHIPPING" "$FEES" "$JS"

if git diff --cached --quiet; then
  echo "没有变更，无需提交"
  exit 0
fi

VERSION=$(python3 -c "import json; print(json.load(open('$REMOTE'))['version'])")
git commit -m "update remote config ($VERSION)"

echo ""
read -r -p "推送到 origin? [Y/n] " push_ans
if [[ "${push_ans,,}" != "n" ]]; then
  git push origin HEAD
fi

echo ""
echo "=========================================="
echo "  已发布 — 所有用户插件将自动拉取此版本"
echo "=========================================="
echo ""
echo "请确认 extension/js/remote-config.js 中 REMOTE_CONFIG_URL"
echo "已指向你的 GitHub Raw 地址（发布插件时配置一次即可）:"
echo ""
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [[ "$REMOTE_URL" == *github.com* ]]; then
  REPO_PATH=$(echo "$REMOTE_URL" | sed -E 's#.*github.com[:/](.+)(\.git)?$#\1#' | sed 's/\.git$//')
  BRANCH=$(git branch --show-current)
  echo "  https://raw.githubusercontent.com/${REPO_PATH}/${BRANCH}/server/data/remote-config.json"
else
  echo "  https://raw.githubusercontent.com/USER/REPO/main/server/data/remote-config.json"
fi
echo ""
