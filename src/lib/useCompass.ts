"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type DOEStatic = { requestPermission?: () => Promise<"granted" | "denied"> };

export type CompassState = "idle" | "on" | "denied" | "unsupported";

// Компас устройства: курс в градусах от севера. На iOS нужно разрешение (запрашивается по нажатию), на Android включается сразу.
export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [state, setState] = useState<CompassState>("idle");
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const on = (e: Event) => {
      const o = e as OrientationEvent;
      let h: number | null = null;
      if (typeof o.webkitCompassHeading === "number") h = o.webkitCompassHeading;
      else if (o.alpha != null && (o.absolute || e.type === "deviceorientationabsolute")) h = (360 - o.alpha) % 360;
      if (h != null && Number.isFinite(h)) { setHeading(h); setState("on"); }
    };
    window.addEventListener("deviceorientationabsolute", on, true);
    window.addEventListener("deviceorientation", on, true);
  }, []);

  const enable = useCallback(async () => {
    const DOE = (window as unknown as { DeviceOrientationEvent?: DOEStatic }).DeviceOrientationEvent;
    if (!DOE) return setState("unsupported");
    if (typeof DOE.requestPermission === "function") {
      try {
        if ((await DOE.requestPermission()) !== "granted") return setState("denied");
      } catch { return setState("denied"); }
    }
    start();
  }, [start]);

  // Android и десктоп: разрешение не требуется, подписываемся сразу
  useEffect(() => {
    const DOE = (window as unknown as { DeviceOrientationEvent?: DOEStatic }).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission !== "function") { const t = setTimeout(start, 0); return () => clearTimeout(t); }
  }, [start]);

  return { heading, state, enable, needsTap: state === "idle" && typeof window !== "undefined" && typeof (window as unknown as { DeviceOrientationEvent?: DOEStatic }).DeviceOrientationEvent?.requestPermission === "function" };
}
