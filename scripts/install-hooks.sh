#!/bin/sh
# نصب hook ی pre-commit برای gitleaks (جلوگیری از commit شدن secret پیش از رسیدن به CI).
set -eu
cd "$(dirname "$0")/.."
if command -v pre-commit >/dev/null 2>&1; then
  pre-commit install
  echo "pre-commit hooks installed (gitleaks + بررسی‌های پایه)."
  exit 0
fi
# جایگزین بدون pre-commit: hook ساده با gitleaks یا Docker
HOOK=".git/hooks/pre-commit"
cat > "$HOOK" <<'HOOK_EOF'
#!/bin/sh
if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks protect --staged --config .gitleaks.toml --redact
elif command -v docker >/dev/null 2>&1; then
  exec docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.21.2 protect --staged --config .gitleaks.toml --redact
fi
echo "gitleaks/docker not found — secret scan skipped (CI will still scan)"; exit 0
HOOK_EOF
chmod +x "$HOOK"
echo "git pre-commit hook installed (gitleaks)."
