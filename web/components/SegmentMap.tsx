"use client";

import { useEffect, useRef } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import { ratioColor, ratioLabel, fmtDuration } from "@/lib/format";

export interface MapSegment {
  index: number;
  name: string;
  geometry: [number, number][]; // [lat, lng]
  ratio: number | null;
  avgSeconds: number | null;
  baselineSeconds: number | null;
  samples: number;
}

export function SegmentMap({ segments }: { segments: MapSegment[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const map = L.map(ref.current, { scrollWheelZoom: false });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      const allPoints: LeafletNS.LatLngExpression[] = [];

      for (const seg of segments) {
      const color = seg.ratio != null ? ratioColor(seg.ratio) : "#64748b";
      const line = L.polyline(seg.geometry, {
        color,
        weight: 7,
        opacity: 0.9,
      }).addTo(map);

      const status = seg.ratio != null ? ratioLabel(seg.ratio) : "Sem dados";
      const detail =
        seg.ratio != null
          ? `<div style="margin-top:4px">Tempo médio: <b>${fmtDuration(
              seg.avgSeconds
            )}</b><br/>Fluxo livre: ${fmtDuration(
              seg.baselineSeconds
            )}<br/>Índice: <b>${seg.ratio.toFixed(2)}×</b> · ${
              seg.samples
            } leituras</div>`
          : "<div style='margin-top:4px'>Aguardando coletas.</div>";

      line.bindPopup(
        `<div style="font-family:system-ui;font-size:13px">
           <div style="font-weight:600">${seg.index + 1}. ${seg.name}</div>
           <div style="color:${color};font-weight:600">${status}</div>
           ${detail}
         </div>`
      );

      seg.geometry.forEach((p) => allPoints.push(p));
      }

      if (allPoints.length) {
        map.fitBounds(L.latLngBounds(allPoints).pad(0.1));
      } else {
        map.setView([-26.3, -48.74], 11);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [segments]);

  return (
    <div
      ref={ref}
      className="h-[480px] w-full overflow-hidden rounded-xl border border-slate-700/60"
      style={{ background: "#0a0f1a" }}
    />
  );
}
