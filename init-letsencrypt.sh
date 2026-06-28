#!/bin/bash
# Bootstrap a Let's Encrypt certificate for one domain.
# Run once per domain. Safe to run while other domains are already live.
# Usage: ./init-letsencrypt.sh <domain> <email>
# Example: ./init-letsencrypt.sh tri-demo.kontracts.pro admin@example.com

set -e

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"
STAGING=0  # Set to 1 to test against Let's Encrypt staging (avoids rate limits)

CERTBOT_CONF="./certbot/conf"
CERTBOT_WWW="./certbot/www"

mkdir -p "$CERTBOT_CONF" "$CERTBOT_WWW"

# Download recommended TLS parameters from Let's Encrypt if not present
if [ ! -e "$CERTBOT_CONF/options-ssl-nginx.conf" ]; then
  echo "### Downloading recommended TLS parameters..."
  curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    -o "$CERTBOT_CONF/options-ssl-nginx.conf"
fi

if [ ! -e "$CERTBOT_CONF/ssl-dhparams.pem" ]; then
  echo "### Downloading DH parameters..."
  curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
    -o "$CERTBOT_CONF/ssl-dhparams.pem"
fi

# Create a temporary self-signed cert so nginx can load this domain's server block
LIVE_DIR="$CERTBOT_CONF/live/$DOMAIN"
if [ ! -d "$LIVE_DIR" ]; then
  echo "### Creating dummy certificate for $DOMAIN..."
  mkdir -p "$LIVE_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$LIVE_DIR/privkey.pem" \
    -out    "$LIVE_DIR/fullchain.pem" \
    -subj "/CN=localhost" 2>/dev/null
fi

# Start nginx if not running, otherwise reload to pick up the new server block
if sudo docker-compose ps nginx 2>/dev/null | grep -q "Up"; then
  echo "### Reloading nginx to load new server block for $DOMAIN..."
  sudo docker-compose exec -T nginx nginx -s reload
else
  echo "### Starting nginx..."
  sudo docker-compose up --detach nginx
fi

echo "### Waiting for nginx to be ready..."
sleep 3

echo "### Removing dummy certificate..."
rm -rf "$CERTBOT_CONF/live/$DOMAIN"

STAGING_FLAG=""
[ "$STAGING" -eq 1 ] && STAGING_FLAG="--staging"

echo "### Requesting Let's Encrypt certificate for $DOMAIN..."
if ! sudo docker-compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  $STAGING_FLAG \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --domain "$DOMAIN"; then
  echo "### Certbot failed for $DOMAIN — restoring dummy certificate so nginx keeps serving other domains."
  mkdir -p "$LIVE_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$LIVE_DIR/privkey.pem" \
    -out    "$LIVE_DIR/fullchain.pem" \
    -subj "/CN=localhost" 2>/dev/null
  sudo docker-compose exec -T nginx nginx -s reload
  exit 1
fi

echo "### Reloading nginx with real certificate..."
sudo docker-compose exec -T nginx nginx -s reload

echo "### Done! Certificate issued for $DOMAIN."
echo "### Auto-renewal runs every 12 hours inside the certbot container."
