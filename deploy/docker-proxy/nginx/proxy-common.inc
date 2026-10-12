# Общие директивы прокси на Vercel. __PROXY_SECRET__ подставляет setup.sh.
proxy_pass https://$vercel;
proxy_http_version 1.1;
proxy_set_header Connection "";

# Vercel выбирает проект по имени хоста: и Host, и SNI равны имени, под которым пришёл посетитель
proxy_ssl_server_name on;
proxy_ssl_name $host;
proxy_set_header Host $host;

# Vercel перезаписывает X-Forwarded-For, поэтому настоящий IP дублируем в свой заголовок с секретом
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Opora-Client-IP $remote_addr;
proxy_set_header X-Opora-Proxy-Secret "__PROXY_SECRET__";

proxy_connect_timeout 5s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
proxy_buffering on;
proxy_buffers 32 64k;
proxy_busy_buffers_size 256k;
