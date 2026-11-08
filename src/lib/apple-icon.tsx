import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          background: "linear-gradient(135deg, #8b5cf6 0%, #34d399 100%)",
          color: "#0b0d14",
          fontSize: 84,
          fontWeight: 900,
          letterSpacing: -3,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        NQ
      </div>
    ),
    { ...size },
  );
}
