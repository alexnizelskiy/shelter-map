import { ImageResponse } from "next/og";
import { __iconData } from "lucide-react/dist/esm/icons/shield-check.mjs";
import { IconSvg } from "@/lib/icon-svg";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #12994a, #34d58a)", borderRadius: 14 }}>
        <IconSvg data={__iconData} size={42} stroke={2.4} />
      </div>
    ),
    size,
  );
}
