#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-smart-parking}"
REPOSITORY="${ECR_REPOSITORY:-smart-parking}"
TAG="${IMAGE_TAG:-$(date -u +%Y%m%d%H%M%S)}"

command -v aws >/dev/null || { echo "AWS CLI v2 is required." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
aws sts get-caller-identity --region "$REGION" >/dev/null

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
REPOSITORY_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY}"
if ! aws ecr describe-repositories --repository-names "$REPOSITORY" --region "$REGION" >/dev/null 2>&1; then
  aws ecr create-repository \
    --repository-name "$REPOSITORY" \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability IMMUTABLE \
    --encryption-configuration encryptionType=AES256 \
    --region "$REGION" >/dev/null
fi

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker build --platform linux/amd64 --tag "${REPOSITORY_URI}:${TAG}" "$ROOT_DIR"
docker push "${REPOSITORY_URI}:${TAG}"

PARAMETERS=("ImageUri=${REPOSITORY_URI}:${TAG}" "CertificateArn=${CERTIFICATE_ARN:-}")
aws cloudformation deploy \
  --template-file "$ROOT_DIR/aws/fargate-app.yml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides "${PARAMETERS[@]}" \
  --region "$REGION"

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table \
  --region "$REGION"
