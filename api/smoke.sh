#!/bin/bash

# Smoke-test the deployed API with a throwaway smoke user. Prints statuses only, never tokens.
set -euo pipefail

AWS_PROFILE=n3x7
REGION=ap-southeast-2
STACK=n3x7-api
SMOKE_USER=smoke-test@n3x7.invalid

out() {
  aws cloudformation describe-stacks --stack-name $STACK --region $REGION --profile $AWS_PROFILE \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
API=$(out ApiUrl)
POOL=$(out UserPoolId)
CLIENT=$(out SmokeClientId)

if ! aws cognito-idp admin-get-user --user-pool-id "$POOL" --username $SMOKE_USER \
  --region $REGION --profile $AWS_PROFILE > /dev/null 2>&1; then
  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username $SMOKE_USER \
    --user-attributes Name=email,Value=$SMOKE_USER Name=name,Value="Smoke Test" \
    --message-action SUPPRESS --region $REGION --profile $AWS_PROFILE > /dev/null
fi
PASS="Sm0ke!$(openssl rand -hex 12)"
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username $SMOKE_USER \
  --password "$PASS" --permanent --region $REGION --profile $AWS_PROFILE
TOKEN=$(aws cognito-idp admin-initiate-auth --user-pool-id "$POOL" --client-id "$CLIENT" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH --auth-parameters USERNAME=$SMOKE_USER,PASSWORD="$PASS" \
  --region $REGION --profile $AWS_PROFILE --query 'AuthenticationResult.IdToken' --output text)

fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "✅ $1 → $3"; else echo "❌ $1 → $3 (expected $2)"; fail=1; fi
}

code=$(curl -s -o /dev/null -w '%{http_code}' "$API/listings?suburb=Blacktown")
check "no token" 401 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/listings?suburb=Glebe")
check "unsupported suburb" 400 "$code"

for s in Blacktown "Quakers%20Hill" "Seven%20Hills"; do
  body=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/listings?suburb=$s")
  code=$(echo "$body" | tail -1)
  count=$(echo "$body" | sed '$d' | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("listings",[])))' 2>/dev/null || echo 0)
  check "listings $s (count $count)" 200 "$code"
  [ "$count" -gt 0 ] || { echo "❌ listings $s returned no listings"; fail=1; }
done

ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/listings?suburb=Blacktown" \
  | python3 -c 'import sys,json; l=json.load(sys.stdin)["listings"]; print(next((x["cotalityId"] for x in l if x.get("agentName")), l[0]["cotalityId"]))')
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/listings/$ID/campaign")
check "campaign for a listed property" 200 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: https://next.eronka.com" \
  -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization" "$API/listings")
check "CORS preflight" 204 "$code"

exit $fail
