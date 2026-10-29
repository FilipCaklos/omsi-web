"use client";

import { useId, useState } from "react";

/** Prepínač dvoch serverovo vyrenderovaných rebríčkov (7 dní / celkovo) bez ďalšej požiadavky. */
export function RankingTabs({
  labels,
  panels,
}: {
  labels: [string, string];
  panels: [React.ReactNode, React.ReactNode];
}) {
  const [active, setActive] = useState<0 | 1>(0);
  const baseId = useId();

  return (
    <div>
      <div role="tablist" className="mb-2 inline-flex rounded-[5px] border border-line p-0.5 font-mono text-[11px]">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${baseId}-tab-${index}`}
            aria-selected={active === index}
            aria-controls={`${baseId}-panel-${index}`}
            onClick={() => setActive(index as 0 | 1)}
            className={[
              "rounded-[3px] px-2.5 py-1 font-semibold transition-colors",
              active === index ? "bg-amber text-amber-ink" : "text-muted hover:text-text",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          hidden={active !== index}
        >
          {panel}
        </div>
      ))}
    </div>
  );
}
