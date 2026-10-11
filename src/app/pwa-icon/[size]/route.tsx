import { ImageResponse } from "next/og";
import { __iconData } from "lucide-react/dist/esm/icons/shield-check.mjs";
import { IconSvg } from "@/lib/icon-svg";

// Иконка приложения: знак из библиотеки иконок на зелёном фоне. /pwa-icon/192, /512, /maskable (с запасом под обрезку)
export async function GET(_: Request, ctx: { params: Promise<{ size: string }> }) {
  const p = (await ctx.params).size;
  const size = p === "192" ? 192 : 512;
  const maskable = p === "maskable";
  const glyph = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #12994a, #34d58a)", borderRadius: maskable ? 0 : Math.round(size * 0.22) }}>
        <IconSvg data={__iconData} size={glyph} stroke={2.2} />
      </div>
    ),
    { width: size, height: size },
  );
}
