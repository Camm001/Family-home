#!/bin/bash
# Deploy latest code to the Family Hub LXC.
# Safe to run at any time — never touches .env, the database, or uploaded files.

set -e

HOST="root@10.0.0.217"
REMOTE_DIR="/opt/family-hub"

echo "Deploying to $HOST..."

rsync -av \
  --exclude node_modules \
  --exclude .env \
  --exclude family-hub.db \
  --exclude '*.db-shm' \
  --exclude '*.db-wal' \
  --exclude 'data/' \
  --exclude 'backups/' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$(cd "$(dirname "$0")" && pwd)/" \
  "$HOST:$REMOTE_DIR/"

echo "Restarting service..."
ssh -o StrictHostKeyChecking=no "$HOST" \
  "cd $REMOTE_DIR && npm install --omit=dev --quiet && systemctl restart family-hub && sleep 2 && systemctl status family-hub --no-pager"

echo ""
echo "Deploy complete."
