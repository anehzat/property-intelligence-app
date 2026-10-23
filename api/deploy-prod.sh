#!/bin/bash

# Build the Cotality API Lambda and deploy the n3x7-api stack to production
set -euo pipefail

echo "🚀 Starting API production deployment process..."

# Variables
AWS_PROFILE=n3x7
REGION=ap-southeast-2
STACK=n3x7-api

cd "$(dirname "$0")"

echo "🔐 Checking AWS credentials..."
ACCOUNT=$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text)
BUCKET=n3x7-deploy-$ACCOUNT
echo "   Account: $ACCOUNT (profile: $AWS_PROFILE)"
echo ""
echo "📋 Source: branch $(git rev-parse --abbrev-ref HEAD), commit $(git rev-parse --short HEAD)"
echo ""

read -p "⚠️  Are you sure you want to deploy the API to PRODUCTION? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Deployment cancelled"
  exit 0
fi

echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile > /dev/null
echo "🧪 Running tests..."
pnpm test > /dev/null
pnpm typecheck
echo "🏗️  Building Lambda bundle..."
rm -rf dist
pnpm build > /dev/null

if ! aws s3api head-bucket --bucket "$BUCKET" --profile $AWS_PROFILE > /dev/null 2>&1; then
  echo "🪣 Creating deployment bucket $BUCKET..."
  aws s3api create-bucket --bucket "$BUCKET" --region $REGION \
    --create-bucket-configuration LocationConstraint=$REGION --profile $AWS_PROFILE > /dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" --profile $AWS_PROFILE \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

echo "⬆️  Packaging..."
aws cloudformation package --template-file template.yaml --s3-bucket "$BUCKET" --s3-prefix $STACK \
  --output-template-file packaged.yaml --region $REGION --profile $AWS_PROFILE > /dev/null

echo "🔄 Deploying stack $STACK..."
aws cloudformation deploy --template-file packaged.yaml --stack-name $STACK \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND --no-fail-on-empty-changeset \
  --region $REGION --profile $AWS_PROFILE
rm -f packaged.yaml

echo ""
echo "✅ API deployment complete!"
echo "=========================================="
aws cloudformation describe-stacks --stack-name $STACK --region $REGION --profile $AWS_PROFILE \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
echo ""
echo "🔗 Useful commands:"
echo "   Logs: aws logs tail /aws/lambda/n3x7-api --follow --region $REGION --profile $AWS_PROFILE"
echo "   Smoke test: ./smoke.sh"
