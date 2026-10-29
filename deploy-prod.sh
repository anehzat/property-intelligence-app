#!/bin/bash

# Build the static site and deploy it straight to production on AWS Amplify
set -euo pipefail

echo "🚀 Starting production deployment process..."

# Variables
AWS_PROFILE=n3x7
REGION=ap-southeast-2
AMPLIFY_APP_ID=d2tgqj6ewcyky0
AMPLIFY_BRANCH=main
PROD_URL=https://next.eronka.com
AMPLIFY_URL=https://$AMPLIFY_BRANCH.$AMPLIFY_APP_ID.amplifyapp.com

cd "$(dirname "$0")"

echo "🔐 Checking AWS credentials..."
ACCOUNT=$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text)
echo "   Account: $ACCOUNT (profile: $AWS_PROFILE)"

COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "📋 Source: branch $BRANCH, commit $COMMIT"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "⚠️  You have uncommitted changes. They WILL be included in this build:"
  git status --short --untracked-files=no
fi
echo ""

# Confirmation
read -p "⚠️  Are you sure you want to deploy this to PRODUCTION? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Deployment cancelled"
  exit 0
fi

echo ""
echo "🧪 Running tests..."
pnpm test > /dev/null

echo "🏗️  Building static site..."
rm -rf out
pnpm build > /dev/null
if [ ! -f out/index.html ]; then
  echo "❌ Build did not produce out/index.html"
  exit 1
fi

echo "📦 Zipping build..."
ZIP=$(mktemp -t n3x7-deploy).zip
(cd out && zip -qr "$ZIP" .)

echo "⬆️  Uploading to Amplify..."
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment \
  --app-id $AMPLIFY_APP_ID \
  --branch-name $AMPLIFY_BRANCH \
  --region $REGION \
  --profile $AWS_PROFILE \
  --query '[jobId,zipUploadUrl]' \
  --output text)
curl -sf -T "$ZIP" "$UPLOAD_URL" > /dev/null
rm -f "$ZIP"

aws amplify start-deployment \
  --app-id $AMPLIFY_APP_ID \
  --branch-name $AMPLIFY_BRANCH \
  --job-id "$JOB_ID" \
  --region $REGION \
  --profile $AWS_PROFILE \
  --output json > /dev/null

echo "⏳ Waiting for deployment (job $JOB_ID)..."
for _ in $(seq 1 60); do
  STATUS=$(aws amplify get-job \
    --app-id $AMPLIFY_APP_ID \
    --branch-name $AMPLIFY_BRANCH \
    --job-id "$JOB_ID" \
    --region $REGION \
    --profile $AWS_PROFILE \
    --query 'job.summary.status' \
    --output text)
  case "$STATUS" in
    SUCCEED) break ;;
    FAILED|CANCELLED) echo "❌ Deployment $STATUS"; exit 1 ;;
  esac
  sleep 5
done
if [ "$STATUS" != "SUCCEED" ]; then
  echo "❌ Timed out waiting for deployment (last status: $STATUS)"
  exit 1
fi

echo ""
echo "✅ Production deployment complete!"
echo "=========================================="
echo "🌐 URL: $PROD_URL"
echo "   (Amplify URL: $AMPLIFY_URL)"
echo "📍 Region: $REGION"
echo "🏷️  Commit: $COMMIT ($BRANCH)"
echo "📝 Amplify job: $JOB_ID"
echo ""
echo "🔗 Useful commands:"
echo "   Recent deployments:"
echo "   aws amplify list-jobs --app-id $AMPLIFY_APP_ID --branch-name $AMPLIFY_BRANCH --region $REGION --profile $AWS_PROFILE --max-items 5"
