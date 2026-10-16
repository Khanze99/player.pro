"use client";

// Веб-версия mobile/src/components/BodyMap.tsx в readOnly-режиме: обычный <svg>
// вместо react-native-svg, без шторки редактирования (v1 — только просмотр,
// docs/plan-web-day-detail.md). Список точек под манекеном рисует вызывающий
// компонент (DayDetailPanel) — этот компонент только манекен + переключатель вида.

import { useId, useState } from "react";

import {
  MANNEQUIN_DIVIDERS_BACK,
  MANNEQUIN_DIVIDERS_FRONT,
  MANNEQUIN_SIL,
  MANNEQUIN_ZONES,
  severityColor,
} from "@/lib/bodyMap";
import type { PainPoint } from "@/types";

function initialView(points: PainPoint[]): "front" | "back" {
  if (points.length === 0) return "front";
  const zoneView = (region: PainPoint["region"], side: PainPoint["side"]) =>
    MANNEQUIN_ZONES.find((z) => z.region === region && z.side === side)?.view;
  const hasFront = points.some((p) => zoneView(p.region, p.side) === "front");
  const hasBack = points.some((p) => zoneView(p.region, p.side) === "back");
  return !hasFront && hasBack ? "back" : "front";
}

export function BodyMapView({ points }: { points: PainPoint[] }) {
  // id уникален на инстанс: в отличие от react-native-svg (один экран — одна
  // карта боли), на HTML-странице теоретически может оказаться два манекена
  // одновременно — фиксированный id склеил бы clipPath первого со вторым.
  const clipId = `mannequinSil-${useId()}`;
  const [view, setView] = useState<"front" | "back">(() => initialView(points));

  const pointFor = (region: PainPoint["region"], side: PainPoint["side"]) =>
    points.find((p) => p.region === region && p.side === side);

  const zones = MANNEQUIN_ZONES.filter((z) => z.view === view);
  const dividers = view === "front" ? MANNEQUIN_DIVIDERS_FRONT : MANNEQUIN_DIVIDERS_BACK;

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {(["front", "back"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex-1 text-xs font-medium py-1.5 rounded-sm transition-colors"
            style={{
              backgroundColor: view === v ? "var(--accent)" : "var(--surface-muted)",
              color: view === v ? "white" : "var(--text-muted)",
            }}
          >
            {v === "front" ? "Спереди" : "Сзади"}
          </button>
        ))}
      </div>

      <div className="flex justify-between px-4 mb-1">
        <span className="text-[11px] tracking-wide text-[var(--text-faint)]">ЛЕВО</span>
        <span className="text-[11px] tracking-wide text-[var(--text-faint)]">ПРАВО</span>
      </div>

      <svg viewBox="0 0 300 600" className="w-full max-h-[360px] mx-auto">
        <defs>
          <clipPath id={clipId}>
            <path d={MANNEQUIN_SIL} />
          </clipPath>
        </defs>

        <path d={MANNEQUIN_SIL} fill="var(--surface-muted)" stroke="var(--border-strong)" strokeWidth={1.4} />

        {zones.map((z) => {
          const point = pointFor(z.region, z.side);
          return (
            <path
              key={`${z.region}:${z.side}`}
              d={z.d}
              clipPath={`url(#${clipId})`}
              fill={point ? severityColor(point.severity) : "transparent"}
              fillOpacity={point ? 0.82 : 0}
            />
          );
        })}

        {dividers.map((d, i) => (
          <path
            key={`div-${view}-${i}`}
            d={d}
            clipPath={`url(#${clipId})`}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={1.3}
            strokeDasharray="5,4"
          />
        ))}
      </svg>
    </div>
  );
}
