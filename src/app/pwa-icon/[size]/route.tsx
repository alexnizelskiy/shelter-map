import { ImageResponse } from "next/og";
import { OporaMark } from "@/lib/opora-mark";

// Иконки приложения: зелёный знак «Опора» на тёмном фоне. /pwa-icon/48, /192, /512 и /maskable (с запасом под обрезку)
export async function GET(_: Request, ctx: { params: Promise<{ size: string }> }) {
  const p = (await ctx.params).size;
  const size = p === "48" ? 48 : p === "192" ? 192 : 512;
  const maskable = p === "maskable";
  const mark = Math.round(size * (maskable ? 0.56 : p === "48" ? 0.82 : 0.68));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #2b2d33, #131417)", borderRadius: maskable ? 0 : Math.round(size * 0.22) }}>
        <OporaMark size={mark} />
      </div>
    ),
    { width: size, height: size },
  );
}
