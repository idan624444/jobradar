#!/bin/bash
# One-time setup: lets GitHub upload JobRadar to Firebase Hosting, and nothing else.
# 1. Creates a service account that has ONLY the "Firebase Hosting Admin" role in project jobradar-tehila.
# 2. Creates a key for it, stores the key as an encrypted GitHub secret (FIREBASE_SERVICE_ACCOUNT),
#    then deletes the local copy so it never stays on this computer.
set -euo pipefail
G="$(brew --prefix)/share/google-cloud-sdk/bin/gcloud"
P=jobradar-tehila
SA="github-deploy@$P.iam.gserviceaccount.com"

"$G" services enable firebasehosting.googleapis.com iam.googleapis.com --project "$P"
"$G" iam service-accounts describe "$SA" --project "$P" >/dev/null 2>&1 \
  || "$G" iam service-accounts create github-deploy --project "$P" --display-name "GitHub deploy (Hosting only)"
"$G" projects add-iam-policy-binding "$P" --member "serviceAccount:$SA" \
  --role roles/firebasehosting.admin --condition=None >/dev/null
echo "✓ deploy account ready (Firebase Hosting Admin only)"

KEYDIR="$(mktemp -d)"; KEY="$KEYDIR/key.json"
trap 'rm -P "$KEY" 2>/dev/null || rm -f "$KEY"; rmdir "$KEYDIR" 2>/dev/null || true' EXIT
"$G" iam service-accounts keys create "$KEY" --iam-account "$SA" --project "$P"
gh secret set FIREBASE_SERVICE_ACCOUNT -R idan624444/jobradar < "$KEY"
echo "✓ key stored as an encrypted GitHub secret; local copy deleted"
