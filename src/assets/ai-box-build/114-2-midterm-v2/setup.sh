#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive
REF_ROOT="/tmp/cstg-ai-build/reference/114-2-midterm_v2"
LOG_PREFIX="[flow-setup]"

log() {
  echo "${LOG_PREFIX} $*"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "setup.sh must run as root" >&2
    exit 1
  fi
}

append_hosts() {
  grep -qE '[[:space:]]flow\.ethci([[:space:]]|$)' /etc/hosts || echo "127.0.0.1 flow.ethci flowise.flow.ethci" >> /etc/hosts
}

install_wp_cli() {
  if command -v wp >/dev/null 2>&1; then
    return
  fi
  curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp
  chmod +x /usr/local/bin/wp
}

mysql_exec() {
  mysql --protocol=socket -uroot -e "$1"
}

setup_users_and_flags() {
  log "Creating lab users and flags"
  if ! id sakiko >/dev/null 2>&1; then
    useradd -m -s /bin/bash sakiko
  fi
  echo 'sakiko:2cute4u' | chpasswd
  echo 'root:46KgXS2Mb77D' | chpasswd
  # Ubuntu 26.04 defaults to yescrypt, but ModelDrive intentionally validates
  # /etc/shadow through PHP crypt(), which needs a SHA-512 crypt hash here.
  usermod --password "$(openssl passwd -6 -salt cstg1142sakiko '2cute4u')" sakiko
  usermod --password "$(openssl passwd -6 -salt cstg1142root '46KgXS2Mb77D')" root
  usermod -aG sudo sakiko || true

  install -d -m 0755 -o sakiko -g sakiko /home/sakiko
  echo 'd11de95f4be9c2cda197e93ac00927a6' > /home/sakiko/user.txt
  chown root:sakiko /home/sakiko/user.txt
  chmod 0644 /home/sakiko/user.txt

  echo '0b56ee4d92e42cca7544e78a39ea0d8c' > /root/root.txt
  chown root:root /root/root.txt
  chmod 0640 /root/root.txt

  cat > /root/flags.list <<'EOF_FLAGS'
/home/sakiko/user.txt
/root/root.txt
EOF_FLAGS
  cat > /root/flag.sh <<'EOF_FLAGSH'
#!/bin/sh
cat /home/sakiko/user.txt
cat /root/root.txt
EOF_FLAGSH
  chmod 0750 /root/flag.sh
}

install_packages() {
  log "Installing packages"
  apt-get update -y
  apt-get install -y \
    apache2 \
    mysql-server \
    php \
    php-cli \
    php-mysql \
    php-curl \
    php-gd \
    php-xml \
    php-mbstring \
    php-zip \
    php-intl \
    libapache2-mod-php \
    unzip \
    curl \
    wget \
    sudo \
    jq \
    python3 \
    python3-venv \
    python3-pip \
    net-tools \
    iproute2 \
    gcc \
    libssl-dev
}

setup_mysql() {
  log "Configuring MySQL"
  systemctl enable mysql >/dev/null 2>&1 || true
  systemctl restart mysql
  mysql_exec "CREATE DATABASE IF NOT EXISTS wp DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql_exec "CREATE USER IF NOT EXISTS 'wordpress'@'localhost' IDENTIFIED BY 'password';"
  mysql_exec "ALTER USER 'wordpress'@'localhost' IDENTIFIED BY 'password';"
  mysql_exec "GRANT ALL PRIVILEGES ON wp.* TO 'wordpress'@'localhost'; FLUSH PRIVILEGES;"
}

setup_apache_vhosts() {
  log "Configuring Apache vhosts"
  cat > /etc/apache2/sites-available/wordpress.conf <<'EOF_WORDPRESS_VHOST'
<VirtualHost *:80>
    ServerName flow.ethci
    DocumentRoot /var/www/wordpress

    <Directory /var/www/wordpress>
        Options FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/flow_wordpress_error.log
    CustomLog ${APACHE_LOG_DIR}/flow_wordpress_access.log combined
</VirtualHost>
EOF_WORDPRESS_VHOST

  cat > /etc/apache2/sites-available/flowise.conf <<'EOF_FLOWISE_VHOST'
<VirtualHost *:80>
    ServerName flowise.flow.ethci
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    ErrorLog ${APACHE_LOG_DIR}/flowise_error.log
    CustomLog ${APACHE_LOG_DIR}/flowise_access.log combined
</VirtualHost>
EOF_FLOWISE_VHOST

  cat > /etc/apache2/sites-available/000-default.conf <<'EOF_DEFAULT_VHOST'
<VirtualHost *:80>
    ServerName _
    RewriteEngine On
    RewriteRule ^/(.*)$ http://flow.ethci/$1 [R=302,L]
</VirtualHost>
EOF_DEFAULT_VHOST

  a2enmod rewrite proxy proxy_http >/dev/null
  a2ensite 000-default.conf wordpress.conf flowise.conf >/dev/null
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl restart apache2
}

setup_wordpress() {
  log "Installing WordPress and Ultimate Member"
  install_wp_cli
  rm -rf /var/www/wordpress
  install -d -m 0755 -o www-data -g www-data /var/www/wordpress

  wp core download --path=/var/www/wordpress --allow-root
  wp config create \
    --path=/var/www/wordpress \
    --dbname=wp \
    --dbuser=wordpress \
    --dbpass=password \
    --dbhost=localhost \
    --skip-salts \
    --force \
    --allow-root
  wp config set WP_HOME 'http://flow.ethci' --path=/var/www/wordpress --type=constant --allow-root
  wp config set WP_SITEURL 'http://flow.ethci' --path=/var/www/wordpress --type=constant --allow-root
  wp config set DISALLOW_FILE_MODS true --raw --path=/var/www/wordpress --type=constant --allow-root

  wp core install \
    --path=/var/www/wordpress \
    --url='http://flow.ethci' \
    --title='AI-overflow' \
    --admin_user=admin \
    --admin_password='yzrHbRY$XbN99Hq@H8' \
    --admin_email='admin@flow.ethci' \
    --skip-email \
    --allow-root

  wp plugin install https://downloads.wordpress.org/plugin/ultimate-member.2.6.6.zip --activate --force --path=/var/www/wordpress --allow-root
  wp option update admin_email 'admin@flow.ethci' --path=/var/www/wordpress --allow-root
  wp option delete admin_email_lifespan --path=/var/www/wordpress --allow-root || true
  wp user update admin --user_email='admin@flow.ethci' --path=/var/www/wordpress --allow-root

  wp post create --post_type=page --post_status=publish --post_title='Login' --post_name='login' --post_content='[ultimatemember form_id="login"]' --path=/var/www/wordpress --allow-root >/dev/null || true
  wp post create --post_type=page --post_status=publish --post_title='Register' --post_name='register' --post_content='[ultimatemember form_id="register"]' --path=/var/www/wordpress --allow-root >/dev/null || true

  local ai_content modeldrive_content flowise_content
  ai_content="$(cat "${REF_ROOT}/Lab/wordpress_page_content/AI-overflow.md" 2>/dev/null || true)"
  modeldrive_content="$(cat "${REF_ROOT}/Lab/wordpress_page_content/ModelDrive.md" 2>/dev/null || true)"
  flowise_content="$(cat "${REF_ROOT}/Lab/wordpress_page_content/Flowise.md" 2>/dev/null || true)"

  wp post create --post_type=post --post_status=publish --post_title='The AI is Overflowing !!' --post_content="${ai_content}" --path=/var/www/wordpress --allow-root >/dev/null || true
  wp post create --post_type=post --post_status=publish --post_title='Introducing ModelDrive - Share AI Models With Your Team' --post_content="${modeldrive_content}" --path=/var/www/wordpress --allow-root >/dev/null || true
  wp post create --post_type=post --post_status=draft --post_title='Flowise private deployment notes' --post_content="${flowise_content}

TODO: finalize wording before going live
internal URL: http://flowise.flow.ethci
test account: admin@flow.ethci / 1JETB@9eYIZ8J!" --path=/var/www/wordpress --allow-root >/dev/null

  chown -R www-data:www-data /var/www/wordpress
  systemctl restart apache2
}

setup_fake_flowise() {
  log "Configuring Flowise 3.0.4 compatible lab service"
  install -d -m 0755 -o sakiko -g sakiko /home/sakiko/flowise
  install -d -m 0755 /opt/flowise-lab
  cat > /opt/flowise-lab/flowise_lab.py <<'PY_FLOWISE'
#!/usr/bin/env python3
import json
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

EMAIL = "admin@flow.ethci"
PASSWORD = "1JETB@9eYIZ8J!"

class Handler(BaseHTTPRequestHandler):
    server_version = "Flowise/3.0.4"

    def _send(self, code, body, ctype="application/json"):
        raw = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode())
        except Exception:
            return {}

    def do_GET(self):
        if self.path in ("/", "/signin"):
            self._send(200, "<html><title>Flowise</title><body><h1>Flowise 3.0.4</h1><form>Sign in</form></body></html>", "text/html")
            return
        if self.path.startswith("/api/v1/version"):
            self._send(200, json.dumps({"version": "3.0.4"}))
            return
        if self.path.startswith("/apikey"):
            self._send(200, "<html><body><h1>API Keys</h1><code>vPw-fLKO0WMoBwUkE6pMLmPF25yFB9UeMAhuYDZ3L4Q</code></body></html>", "text/html")
            return
        self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        data = self._json()
        if self.path == "/api/v1/auth/login":
            if data.get("email") == EMAIL and data.get("password") == PASSWORD:
                self._send(200, json.dumps({"token": "vPw-fLKO0WMoBwUkE6pMLmPF25yFB9UeMAhuYDZ3L4Q", "user": {"email": EMAIL}}))
            else:
                self._send(401, json.dumps({"message": "Invalid credentials"}))
            return
        if self.path == "/api/v1/node-load-method/customMCP":
            config = str((data.get("inputs") or {}).get("mcpServerConfig") or "")
            match = re.search(r'execSync\("((?:\\\\.|[^"\\\\])*)"\)', config)
            if not match:
                match = re.search(r"execSync\('((?:\\\\.|[^'\\\\])*)'\)", config)
            if not match:
                self._send(400, json.dumps({"ok": False, "message": "No execSync command found"}))
                return
            command = bytes(match.group(1), "utf-8").decode("unicode_escape")
            result = subprocess.run(command, shell=True, text=True, capture_output=True, timeout=30)
            self._send(200, json.dumps({"ok": True, "stdout": result.stdout, "stderr": result.stderr, "code": result.returncode}))
            return
        self._send(404, json.dumps({"error": "not found"}))

    def log_message(self, fmt, *args):
        return

if __name__ == "__main__":
    os.chdir("/home/sakiko")
    ThreadingHTTPServer(("127.0.0.1", 3000), Handler).serve_forever()
PY_FLOWISE
  chmod 0755 /opt/flowise-lab/flowise_lab.py
  chown -R sakiko:sakiko /home/sakiko/flowise

  cat > /etc/systemd/system/flowise.service <<'EOF_FLOWISE_SERVICE'
[Unit]
Description=Flowise 3.0.4 Lab Service
After=network.target

[Service]
Type=simple
User=sakiko
WorkingDirectory=/home/sakiko
ExecStart=/usr/bin/python3 /opt/flowise-lab/flowise_lab.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF_FLOWISE_SERVICE
  systemctl daemon-reload
  systemctl enable --now flowise.service
}

setup_modeldrive() {
  log "Deploying ModelDrive"
  rm -rf /var/www/ModelDrive
  install -d -m 0755 /var/www/ModelDrive/src
  cp -a "${REF_ROOT}/ModelDrive/src/." /var/www/ModelDrive/src/
  install -d -m 0775 /var/www/ModelDrive/src/uploads
  chown -R root:www-data /var/www/ModelDrive
  chmod -R o-rwx /var/www/ModelDrive
  chmod 0750 /var/www/ModelDrive /var/www/ModelDrive/src
  chmod 0775 /var/www/ModelDrive/src/uploads
  cat > /var/www/ModelDrive/src/config.json <<'EOF_MODELCONFIG'
{
    "shadow_file": "/etc/shadow",
    "debug": false
}
EOF_MODELCONFIG
  chown root:www-data /var/www/ModelDrive/src/config.json
  chmod 0640 /var/www/ModelDrive/src/config.json

  cat > /etc/systemd/system/modeldrive.service <<'EOF_MODELDRIVE_SERVICE'
[Unit]
Description=ModelDrive localhost service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/ModelDrive/src
ExecStart=/usr/bin/php -S 127.0.0.1:8000 -t /var/www/ModelDrive/src /var/www/ModelDrive/src/router.php
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF_MODELDRIVE_SERVICE

  cat > /etc/sudoers.d/sakiko-modeldrive <<'EOF_SUDOERS'
sakiko ALL=(ALL) NOPASSWD: sudoedit /var/www/ModelDrive/src/config.json
sakiko ALL=(ALL) NOPASSWD: /root/flag.sh
EOF_SUDOERS
  chmod 0440 /etc/sudoers.d/sakiko-modeldrive
  visudo -cf /etc/sudoers.d/sakiko-modeldrive >/dev/null

  systemctl daemon-reload
  systemctl enable --now modeldrive.service
}

disable_histories() {
  log "Disabling common shell histories"
  for home in /root /home/sakiko; do
    [ -d "$home" ] || continue
    ln -sf /dev/null "$home/.bash_history"
    ln -sf /dev/null "$home/.mysql_history"
    ln -sf /dev/null "$home/.viminfo"
  done
}

main() {
  require_root
  if [ ! -d "$REF_ROOT" ]; then
    echo "Reference bundle not found at ${REF_ROOT}" >&2
    exit 1
  fi
  hostnamectl set-hostname flow || true
  append_hosts
  install_packages
  setup_users_and_flags
  setup_mysql
  setup_apache_vhosts
  setup_wordpress
  setup_fake_flowise
  setup_modeldrive
  disable_histories
  systemctl restart apache2 flowise modeldrive
  log "Flow lab setup complete"
}

main "$@"
