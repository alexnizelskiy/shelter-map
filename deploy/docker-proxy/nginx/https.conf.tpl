# Прокси на Vercel для __DOMAIN__ (имена: __NAMES__)
server {
    listen 80;
    listen [::]:80;
    server_name __NAMES__;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name __NAMES__;

    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    client_max_body_size 25m;
    set $vercel cname.vercel-dns.com;   # адрес Vercel определяется по DNS (не зашит), его IP могут меняться

    # Статика Next.js (имена файлов с хэшем): долгий кэш; при сбое Vercel отдаётся сохранённая копия
    location ^~ /_next/static/ {
        include /etc/nginx/proxy-common.inc;
        proxy_cache cache_zone;
        proxy_cache_key "$scheme$host$request_uri";
        proxy_cache_valid 200 30d;
        proxy_ignore_headers Set-Cookie;
        proxy_cache_use_stale error timeout http_403 http_502 http_503 updating;
        add_header X-Proxy-Cache $upstream_cache_status;
    }

    location / {
        include /etc/nginx/proxy-common.inc;
    }
}
