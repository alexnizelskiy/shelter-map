# Временный конфиг только для выпуска сертификата
server {
    listen 80;
    listen [::]:80;
    server_name __NAMES__;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { default_type text/plain; return 200 'ok'; }
}
