// node --experimental-strip-types scripts/test-nav.mjs
import { bearing, cumulative, currentStep, haversine, project, remainingLine, stepStarts } from "../src/lib/nav.ts";
let bad = 0;
const t = (name, cond, extra = "") => { if (!cond) bad++; console.log(cond ? "OK  " : "FAIL", name, extra); };

// маршрут на восток ~1 км вдоль параллели, затем на север ~1 км
const A = [39.7, 47.2], B = [39.7132, 47.2], C = [39.7132, 47.209];
const line = [A, B, C];
const cum = cumulative(line);
t("длина ~2 км", cum[2] > 1900 && cum[2] < 2100, cum[2].toFixed(0));
t("курс на восток ≈ 90°", Math.abs(bearing(A, B) - 90) < 1, bearing(A, B).toFixed(1));
t("курс на север ≈ 0°", Math.min(bearing(B, C), 360 - bearing(B, C)) < 1);

const p1 = project(line, cum, [39.7066, 47.2004]); // над серединой первого участка, ~44 м севернее
t("проекция: ~500 м пройдено", Math.abs(p1.along - 500) < 25, p1.along.toFixed(0));
t("проекция: боковое отклонение ~44 м", Math.abs(p1.dist - 44) < 6, p1.dist.toFixed(0));

const p2 = project(line, cum, [39.7132, 47.2045]); // на втором участке
t("второй участок: ~1000+500 м", Math.abs(p2.along - (cum[1] + 500)) < 20, p2.along.toFixed(0));
t("остаток начинается с проекции", remainingLine(line, p2)[0][1] > 47.2 && remainingLine(line, p2).length === 2);

const off = project(line, cum, [39.7066, 47.21]); // далеко от маршрута
t("далеко от маршрута: dist > 500 м", off.dist > 500, off.dist.toFixed(0));

const steps = [{ distance: 1000 }, { distance: 1000 }, { distance: 0 }].map((s) => ({ ...s, text: "", duration: 0, type: "", modifier: null, name: "", loc: [0, 0] }));
const starts = stepStarts(steps);
t("шаг 0 при 300 м", currentStep(starts, 300) === 0);
t("шаг 1 при 1500 м", currentStep(starts, 1500) === 1);
t("последний шаг при >2000 м", currentStep(starts, 2500) >= 1);
t("haversine 0", haversine(A, A) === 0);
if (bad) process.exitCode = 1;
