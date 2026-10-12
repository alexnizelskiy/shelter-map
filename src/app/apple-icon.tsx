import { ImageResponse } from "next/og";
import { OporaMark } from "@/lib/opora-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #12994a, #34d58a)" }}>
        <OporaMark size={112} />
      </div>
    ),
    size,
  );
}
