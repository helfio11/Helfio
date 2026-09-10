#!/usr/bin/env sh
set -eu

: "${KEYCLOAK_ADMIN_USERNAME:=admin}"
: "${KEYCLOAK_ADMIN_PASSWORD:?set KEYCLOAK_ADMIN_PASSWORD}"
: "${KEYCLOAK_ADMIN_URL:=http://localhost:8080}"
: "${KEYCLOAK_REALM:=helfio}"
: "${KEYCLOAK_WEB_CLIENT_ID:=helfio-web}"

if [ -z "${KEYCLOAK_FRONTEND_PUBLIC_URL:-}" ]; then
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    KEYCLOAK_FRONTEND_PUBLIC_URL="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  else
    KEYCLOAK_FRONTEND_PUBLIC_URL="http://localhost:5173"
  fi
fi

KEYCLOAK_FRONTEND_PUBLIC_URL=${KEYCLOAK_FRONTEND_PUBLIC_URL%/}
TOKEN=$(curl -fsS -X POST "$KEYCLOAK_ADMIN_URL/realms/master/protocol/openid-connect/token" \
  -d client_id=admin-cli \
  -d "username=$KEYCLOAK_ADMIN_USERNAME" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  -d grant_type=password | jq -r .access_token)

CLIENT=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_ADMIN_URL/admin/realms/$KEYCLOAK_REALM/clients?clientId=$KEYCLOAK_WEB_CLIENT_ID")
CLIENT_ID=$(printf '%s' "$CLIENT" | jq -r '.[0].id')
printf '%s' "$CLIENT" | jq --arg frontend "$KEYCLOAK_FRONTEND_PUBLIC_URL" \
  '.[0] + {
    redirectUris: ((.[0].redirectUris + [$frontend + "/*"]) | unique),
    webOrigins: ((.[0].webOrigins + [$frontend]) | unique),
    attributes: ((.[0].attributes // {}) + {"post.logout.redirect.uris": "+"})
  }' > /tmp/helfio-keycloak-web-client.json

curl -fsS -o /dev/null -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/helfio-keycloak-web-client.json \
  "$KEYCLOAK_ADMIN_URL/admin/realms/$KEYCLOAK_REALM/clients/$CLIENT_ID"
printf 'Configured %s for %s\n' "$KEYCLOAK_WEB_CLIENT_ID" "$KEYCLOAK_FRONTEND_PUBLIC_URL"
