#!/bin/bash
# IFL Platform — Let's Encrypt 초기 SSL 인증서 발급 스크립트
# 사용법: DOMAIN=ifl-platform.com EMAIL=admin@ifl-platform.com ./scripts/init-ssl.sh

set -e

DOMAIN=${DOMAIN:?'DOMAIN 환경변수를 설정하세요 (예: ifl-platform.com)'}
EMAIL=${EMAIL:?'EMAIL 환경변수를 설정하세요 (예: admin@ifl-platform.com)'}

echo "=== IFL SSL 인증서 발급 ==="
echo "도메인: $DOMAIN, api.$DOMAIN"
echo "이메일: $EMAIL"

# 1. certbot 옵션 파일 다운로드
mkdir -p ./certbot/conf
if [ ! -f ./certbot/conf/options-ssl-nginx.conf ]; then
  curl -sS https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    > ./certbot/conf/options-ssl-nginx.conf
fi
if [ ! -f ./certbot/conf/ssl-dhparams.pem ]; then
  curl -sS https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
    > ./certbot/conf/ssl-dhparams.pem
fi

# 2. 더미 인증서로 nginx 시작
mkdir -p ./certbot/conf/live/$DOMAIN
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout ./certbot/conf/live/$DOMAIN/privkey.pem \
  -out ./certbot/conf/live/$DOMAIN/fullchain.pem \
  -subj "/CN=localhost"

echo "--- nginx 시작 (더미 인증서) ---"
docker compose -f docker-compose.prod.yml up -d nginx
sleep 5

# 3. 더미 인증서 삭제 → 실제 발급
rm -rf ./certbot/conf/live/$DOMAIN
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  -d "$DOMAIN" -d "api.$DOMAIN"

# 4. nginx 재시작
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "=== SSL 인증서 발급 완료 ==="
