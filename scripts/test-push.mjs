// node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/test-push.mjs
import { allowedEndpoint, buildPayload, matchesRegion, safePath } from "../src/lib/push-shared.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

t("адреса известных push-сервисов принимаются", ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/xyz", "https://web.push.apple.com/QOk", "https://wns2-par02p.notify.windows.com/w/?token=1"].every(allowedEndpoint));
t("чужие и опасные адреса отклоняются (защита от запросов на произвольные адреса)", ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://localhost/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.example/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "ftp://fcm.googleapis.com/x", "не адрес", "", null, 5].every((u) => !allowedEndpoint(u)));
t("путь после нажатия: только внутри сайта", safePath("/azov?radar=1") === "/azov?radar=1" && safePath("//evil.example") === "/" && safePath("https://evil.example") === "/" && safePath("javascript:alert(1)") === "/" && safePath(undefined) === "/" && safePath("/a b") === "/");

const post = (id, text, region = "") => ({ id, at: "2026-10-15T19:00:00Z", text, region });
const rostov = post(1, "Миллерово\nРостовская область\nФиксация БПЛА", "Ростовская область");
const mention = post(2, "Воронежская область, Ростовская область - отбой опасности по БПЛА.");
const tula = post(3, "Алексин\nТульская область\nРабота ПВО", "Тульская область");
t("регион: по строке региона и по упоминанию в тексте", matchesRegion(rostov, "Ростовская область") && matchesRegion(mention, "Ростовская область") && !matchesRegion(tula, "Ростовская область"));
t("вся Россия (пустой регион): всё подходит", matchesRegion(tula, ""));

const one = buildPayload([rostov], "region", "/rostov-na-donu?radar=1");
t("одно сообщение: текст целиком в одну строку, звук включён для региона", one.title === "Радар" && one.body === "Миллерово · Ростовская область · Фиксация БПЛА" && one.renotify === true && one.url === "/rostov-na-donu?radar=1");
const many = buildPayload([rostov, tula, mention], "all", "/");
t("несколько: «3 новых сообщения», последние два в тексте, без повторного звука для всей России", many.title === "Радар: 3 новых сообщения" && many.body.split("\n").length === 2 && many.renotify === false);
t("склонение числительных", buildPayload([rostov, tula], "all", "/").title === "Радар: 2 новых сообщения" && buildPayload(Array.from({ length: 5 }, (_, i) => post(i, "x")), "all", "/").title === "Радар: 5 новых сообщений" && buildPayload(Array.from({ length: 21 }, (_, i) => post(i, "x")), "all", "/").title === "Радар: 21 новое сообщение");
t("длинный текст обрезается", buildPayload([post(9, "а".repeat(500))], "all", "/").body.length <= 180);
if (bad) process.exitCode = 1;
