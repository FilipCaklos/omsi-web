import { ImageResponse } from "next/og";

export const alt = "OMSI Depo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Predvolený náhľad pre Discord / sociálne siete (mody so screenshotom používajú vlastný obrázok). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0E1116",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              color: "#F59E0B",
              background: "#0B0D10",
              border: "3px solid #2A2F38",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            OD
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#ECF0F6" }}>
            OMSI&nbsp;<span style={{ color: "#8C96A6" }}>Depo</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 44, color: "#ECF0F6" }}>CZ / SK OMSI 2 mods</div>
          <div style={{ display: "flex", fontSize: 30, color: "#8C96A6" }}>Maps · Buses · Repaints · HOF · Sceneryobjects · Splines</div>
        </div>
        <div style={{ display: "flex", height: 10, background: "#F59E0B", borderRadius: 4 }} />
      </div>
    ),
    size,
  );
}
