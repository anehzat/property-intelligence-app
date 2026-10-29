#!/bin/bash

# Invite a staff member to N3X7. Cognito emails them a temporary password.
set -euo pipefail

AWS_PROFILE=n3x7
REGION=ap-southeast-2
STACK=n3x7-api
EMAIL=${1:?usage: ./create-user.sh <email> "<full name>"}
NAME=${2:?usage: ./create-user.sh <email> "<full name>"}

POOL=$(aws cloudformation describe-stacks --stack-name $STACK --region $REGION --profile $AWS_PROFILE \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true Name=name,Value="$NAME" \
  --desired-delivery-mediums EMAIL --region $REGION --profile $AWS_PROFILE > /dev/null

echo "✅ Invited $EMAIL ($NAME). Cognito has emailed a temporary password, valid for 7 days."
echo "   They set a new password on first sign-in at https://next.eronka.com/login"
