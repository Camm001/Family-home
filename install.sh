#!/bin/bash
set -e

# ── Family Hub Installer ──────────────────────────────────────────────────────
# Tested on Debian 12 / Ubuntu 22.04 LXC

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Run as root: sudo bash install.sh"

INSTALL_DIR="/opt/family-hub"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║        Family Hub Installer          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. System deps ───────────────────────────────────────────────────────────
info "Updating apt and installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates openssl

# ── 2. Node.js 20 ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  info "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
success "Node $(node -v) ready"

# ── 3. Copy files ─────────────────────────────────────────────────────────────
info "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

# Copy all project files (script must be run from project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
  cp -r "$SCRIPT_DIR"/. "$INSTALL_DIR/"
fi

# ── 4. npm install ────────────────────────────────────────────────────────────
info "Installing npm packages..."
cd "$INSTALL_DIR"
npm install --omit=dev --quiet

# ── 5. Create data dirs ───────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/data/photos" "$INSTALL_DIR/data/documents" "$INSTALL_DIR/data/receipts" "$INSTALL_DIR/backups"

# ── 6. Generate .env ─────────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  info "Generating .env..."

  read -rp "Port [3085]: " PORT
  PORT="${PORT:-3085}"

  read -rp "Claude API key (optional, press enter to skip): " CLAUDE_KEY

  JWT_SECRET=$(openssl rand -hex 32)

  # Generate VAPID keys
  if node -e "require('web-push')" 2>/dev/null; then
    VAPID=$(node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k.publicKey+'||'+k.privateKey)")
    VAPID_PUBLIC=$(echo "$VAPID" | cut -d'|' -f1)
    VAPID_PRIVATE=$(echo "$VAPID" | cut -d'|' -f3)
  else
    VAPID_PUBLIC=""
    VAPID_PRIVATE=""
  fi

  cat > "$INSTALL_DIR/.env" <<EOF
PORT=${PORT}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production

CLAUDE_API_KEY=${CLAUDE_KEY}

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
DIGEST_FROM=familyhub@localhost
DIGEST_TO=

VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_EMAIL=mailto:admin@familyhub.local

WEBHOOK_SECRET=
N8N_WEBHOOK_URL=

BACKUP_PATH=${INSTALL_DIR}/backups
PAPERLESS_CONSUME_PATH=
EOF
  success ".env generated"
else
  warn ".env already exists — skipping generation"
fi

# ── 7. Initialize DB ──────────────────────────────────────────────────────────
info "Initializing database..."
node -e "
  require('dotenv').config({path:'$INSTALL_DIR/.env'});
  const Database=require('better-sqlite3');
  const fs=require('fs');
  const db=new Database('$INSTALL_DIR/family-hub.db');
  db.pragma('journal_mode=WAL');
  db.pragma('foreign_keys=ON');
  const schema=fs.readFileSync('$INSTALL_DIR/db/schema.sql','utf8');
  db.exec(schema);
  db.close();
  console.log('DB ready');
"
success "Database initialized"

# ── 8. Generate PWA icons ─────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/public/icons"
# Create a simple SVG icon and convert if ImageMagick available
if command -v convert &>/dev/null; then
  cat > /tmp/fh-icon.svg <<'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#1e1b4b"/>
  <text y=".9em" font-size="90" x="5">🏠</text>
</svg>
SVGEOF
  convert -background none /tmp/fh-icon.svg -resize 192x192 "$INSTALL_DIR/public/icons/icon-192.png" 2>/dev/null || true
  convert -background none /tmp/fh-icon.svg -resize 512x512 "$INSTALL_DIR/public/icons/icon-512.png" 2>/dev/null || true
else
  # Minimal 1x1 PNG placeholder
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > "$INSTALL_DIR/public/icons/icon-192.png" 2>/dev/null || true
  cp "$INSTALL_DIR/public/icons/icon-192.png" "$INSTALL_DIR/public/icons/icon-512.png" 2>/dev/null || true
fi

# ── 9. Systemd service ────────────────────────────────────────────────────────
info "Creating systemd service..."
cat > /etc/systemd/system/family-hub.service <<EOF
[Unit]
Description=Family Hub
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=family-hub
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable family-hub
systemctl start family-hub

# ── 10. Done ──────────────────────────────────────────────────────────────────
sleep 2
IP=$(hostname -I | awk '{print $1}')
PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" | cut -d= -f2)
PORT="${PORT:-3085}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Installation Complete!           ║"
echo "╚══════════════════════════════════════════╝"
echo ""
success "Family Hub is running at: http://${IP}:${PORT}"
echo ""
echo "  Logs:    journalctl -u family-hub -f"
echo "  Restart: systemctl restart family-hub"
echo "  Config:  $INSTALL_DIR/.env"
echo ""
echo "  The first person to register becomes admin."
echo ""
