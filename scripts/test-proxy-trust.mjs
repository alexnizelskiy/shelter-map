// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-proxy-trust.mjs
import { clientGeoFromHeaders, clientIpFromHeaders, viaTrustedProxy } from "../src/lib/proxy-trust.ts";
import { ipHash } from "../src/lib/api-utils.ts";
let bad = 0;
const t = (name, cond) => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name); };
const H = (o) => new Headers(o);

process.env.PROXY_SECRET = "s3cret-s3cret-s3cret-1234";
t("верный секрет → доверенный прокси", viaTrustedProxy(H({ "x-opora-proxy-secret": "s3cret-s3cret-s3cret-1234" })));
t("неверный секрет → не доверяем", !viaTrustedProxy(H({ "x-opora-proxy-secret": "wrong" })));
t("без секрета → не доверяем", !viaTrustedProxy(H({})));
t("за прокси берём IP из X-Opora-Client-IP", clientIpFromHeaders(H({ "x-opora-proxy-secret": "s3cret-s3cret-s3cret-1234", "x-opora-client-ip": "5.6.7.8", "x-forwarded-for": "46.19.64.31" })) === "5.6.7.8");
t("подделка IP без секрета игнорируется", clientIpFromHeaders(H({ "x-opora-client-ip": "5.6.7.8", "x-forwarded-for": "46.19.64.31" })) === "46.19.64.31");
t("подделка IP с чужим секретом игнорируется", clientIpFromHeaders(H({ "x-opora-proxy-secret": "x", "x-opora-client-ip": "5.6.7.8", "x-forwarded-for": "9.9.9.9" })) === "9.9.9.9");
t("без прокси работает X-Forwarded-For", clientIpFromHeaders(H({ "x-forwarded-for": "1.2.3.4, 5.5.5.5" })) === "1.2.3.4");
const a = ipHash(new Request("http://x", { headers: { "x-opora-proxy-secret": "s3cret-s3cret-s3cret-1234", "x-opora-client-ip": "5.6.7.8", "x-forwarded-for": "46.19.64.31" } }));
const b = ipHash(new Request("http://x", { headers: { "x-opora-proxy-secret": "s3cret-s3cret-s3cret-1234", "x-opora-client-ip": "5.6.7.9", "x-forwarded-for": "46.19.64.31" } }));
t("разные посетители за одним прокси получают разные хэши", a !== b);
t("геоданные Vercel без прокси", clientGeoFromHeaders(H({ "x-vercel-ip-latitude": "47.2", "x-vercel-ip-longitude": "39.7", "x-vercel-ip-country": "RU" }))?.country === "RU");
t("геоданные Vercel за прокси не используются (там IP прокси)", clientGeoFromHeaders(H({ "x-opora-proxy-secret": "s3cret-s3cret-s3cret-1234", "x-vercel-ip-latitude": "55.7", "x-vercel-ip-longitude": "37.6" })) === null);
t("геоданные из заголовков прокси", clientGeoFromHeaders(H({ "x-opora-proxy-secret": "s3cret-s3cret-s3cret-1234", "x-opora-geo-lat": "47.2", "x-opora-geo-lng": "39.7", "x-opora-geo-country": "RU" }))?.lat === 47.2);
t("подделка геоданных без секрета игнорируется", clientGeoFromHeaders(H({ "x-opora-geo-lat": "47.2", "x-opora-geo-lng": "39.7" })) === null);
if (bad) process.exitCode = 1;
