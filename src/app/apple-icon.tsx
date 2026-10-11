import { ImageResponse } from "next/og";
import { __iconData } from "lucide-react/dist/esm/icons/shield-check.mjs";
import { IconSvg } from "@/lib/icon-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #12994a, #34d58a)" }}>
        <IconSvg data={__iconData} size={112} stroke={2.2} />
      </div>
    ),
    size,
  );
}
