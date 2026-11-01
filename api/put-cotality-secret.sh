#!/bin/bash

# Store the Cotality client credentials in Secrets Manager. Never prints them.
set -euo pipefail

AWS_PROFILE=n3x7
REGION=ap-southeast-2
SECRET_ID=n3x7/cotality
ENV_FILE=${1:-$HOME/.config/n3x7/cotality.env}
export COTALITY_BASE_URL=${COTALITY_BASE_URL:-https://api-sbox.corelogic.asia}
export COTALITY_AUTH_BASE_URL=${COTALITY_AUTH_BASE_URL:-https://auth.corelogic.asia}
export COTALITY_DATA_AUTH=${COTALITY_DATA_AUTH:-client}

echo "🔐 Reading credentials from $ENV_FILE..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${COTALITY_CLIENT_ID:?COTALITY_CLIENT_ID missing in $ENV_FILE}"
: "${COTALITY_CLIENT_SECRET:?COTALITY_CLIENT_SECRET missing in $ENV_FILE}"

TMP=$(mktemp)
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
# Optional values are left out of the JSON when empty.
python3 -c 'import json,os; e=os.environ.get; d={"clientId": e("COTALITY_CLIENT_ID"), "clientSecret": e("COTALITY_CLIENT_SECRET"), "baseUrl": e("COTALITY_BASE_URL"), "authBaseUrl": e("COTALITY_AUTH_BASE_URL"), "userClientId": e("COTALITY_USER_CLIENT_ID"), "userClientSecret": e("COTALITY_USER_CLIENT_SECRET"), "dataAuth": e("COTALITY_DATA_AUTH")}; print(json.dumps({k: v for k, v in d.items() if v}))' > "$TMP"

if aws secretsmanager describe-secret --secret-id $SECRET_ID --region $REGION --profile $AWS_PROFILE > /dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id $SECRET_ID --secret-string "file://$TMP" \
    --region $REGION --profile $AWS_PROFILE > /dev/null
  echo "✅ Updated secret $SECRET_ID (base URL: $COTALITY_BASE_URL, data auth: $COTALITY_DATA_AUTH)"
else
  aws secretsmanager create-secret --name $SECRET_ID --secret-string "file://$TMP" \
    --description "Cotality API client credentials for N3X7" \
    --region $REGION --profile $AWS_PROFILE > /dev/null
  echo "✅ Created secret $SECRET_ID (base URL: $COTALITY_BASE_URL, data auth: $COTALITY_DATA_AUTH)"
fi
