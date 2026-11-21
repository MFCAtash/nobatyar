#!/bin/sh
# فعال‌سازی branch protection روی main با GitHub CLI (نیازمند: gh auth login و دسترسی admin).
# استفاده:  sh scripts/setup-branch-protection.sh [owner/repo] [branch]
# نکته: چک «CI gate» باید حداقل یک‌بار اجرا شده باشد تا GitHub آن را بشناسد.
set -eu
REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
BRANCH="${2:-main}"
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ["CI gate"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
echo "branch protection enabled on $REPO@$BRANCH (required check: CI gate)"
