// node --experimental-strip-types scripts/test-chat-auth.mjs
import { createHash, createHmac } from "node:crypto";
import { displayName, lastInitial, makeSessionToken, pkceChallenge, readSessionToken, safeReturn, verifyTelegramWidget, verifyWebAppData } from "../src/lib/chat-auth.ts";
let bad = 0;
const t = (name, cond) => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name); };

const TOKEN = "123456:TEST-TOKEN";
const now = Math.floor(Date.now() / 1000);

// Telegram Login Widget
const w = { id: 42, first_name: "Иван", last_name: "Петров", username: "ivan", photo_url: "https://t.me/i/u.jpg", auth_date: now };
const check = Object.keys(w).sort().map((k) => `${k}=${w[k]}`).join("\n");
const hash = createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(check).digest("hex");
const id = verifyTelegramWidget({ ...w, hash }, TOKEN);
t("widget: верная подпись принимается", id?.extId === "42" && id.firstName === "Иван");
t("widget: подделка отклоняется", verifyTelegramWidget({ ...w, first_name: "Взлом", hash }, TOKEN) === null);
t("widget: чужой токен отклоняется", verifyTelegramWidget({ ...w, hash }, "999:OTHER") === null);
t("widget: старая подпись отклоняется", verifyTelegramWidget({ ...w, auth_date: now - 90000, hash: createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(Object.keys({ ...w, auth_date: now - 90000 }).sort().map((k) => `${k}=${({ ...w, auth_date: now - 90000 })[k]}`).join("\n")).digest("hex") }, TOKEN) === null);

// initData мини-приложения (Telegram/MAX)
const user = JSON.stringify({ id: 7, first_name: "Анна", last_name: "Смирнова", photo_url: "https://x/a.jpg" });
const pairs = { auth_date: String(now), query_id: "AAH", user };
const dcs = Object.keys(pairs).sort().map((k) => `${k}=${pairs[k]}`).join("\n");
const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
const h2 = createHmac("sha256", secret).update(dcs).digest("hex");
const initData = new URLSearchParams({ ...pairs, hash: h2 }).toString();
t("initData: верная подпись", verifyWebAppData(initData, TOKEN, "max")?.extId === "7");
t("initData: подмена user отклонена", verifyWebAppData(initData.replace("%D0%90%D0%BD%D0%BD%D0%B0", "%D0%9E%D0%BB%D1%8F"), TOKEN, "max") === null);
t("initData: без hash отклонена", verifyWebAppData(`auth_date=${now}&user=${encodeURIComponent(user)}`, TOKEN, "telegram") === null);

// сессия
const s = makeSessionToken(15);
t("сессия: читается", readSessionToken(s.value) === 15);
t("сессия: подпись защищена", readSessionToken(s.value.replace(/^15/, "16")) === null);
t("сессия: мусор отклонён", readSessionToken("abc") === null && readSessionToken(undefined) === null);

// имя: фамилия скрыта
t("имя: «Иван П.»", displayName("Иван", lastInitial("Петров")) === "Иван П.");
t("имя: без фамилии — без точки", displayName("Иван", lastInitial("")) === "Иван");
t("имя: цифра вместо фамилии игнорируется", lastInitial("123") === "");

// PKCE (пример из RFC 7636)
t("PKCE S256", pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
t("returnTo: чужие адреса запрещены", safeReturn("//evil.com") === "/" && safeReturn("https://evil.com") === "/" && safeReturn("/rostov-na-donu?chat=1") === "/rostov-na-donu?chat=1");
if (bad) process.exitCode = 1;
