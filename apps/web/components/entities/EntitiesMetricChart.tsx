"use client";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";

import { useEffect, useState } from "react";
import { ArrowRight01Icon } from "@/components/animate-ui/icons/hugeicons/arrow-right-01";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface EntitiesMetricChartProps {
  peopleCount: number;
  thingsCount: number;
  unlabeledCount: number;
  onNavigateToUnlabeled?: () => void;
}

export function EntitiesMetricChart({
  peopleCount,
  thingsCount,
  unlabeledCount,
  onNavigateToUnlabeled,
}: EntitiesMetricChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const total = peopleCount + thingsCount + unlabeledCount;
  const trained = peopleCount + thingsCount;
  const percentage = total > 0 ? Math.round((trained / total) * 100) : 0;

  const data = [
    { name: "People", value: peopleCount, color: "#7363de" },
    { name: "Things & Places", value: thingsCount, color: "#3fd1c0" },
    { name: "Needs Teaching", value: unlabeledCount, color: "#e3e6f2" },
  ];

  if (!mounted) {
    return (
      <div className="flex h-[180px] w-full items-center justify-center p-4">
        <div className="size-20 animate-pulse rounded-full border-4 border-brand-line/60" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full max-w-sm flex-col justify-between bg-transparent p-1 sm:p-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
            Archive Grounding
          </span>
          <p className="text-sm font-semibold text-brand-ink">Memory Coverage</p>
        </div>
        <span className="rounded-full bg-brand-violet/10 px-2.5 py-0.5 text-xs font-bold text-brand-violet">
          {percentage}% Grounded
        </span>
      </div>

      {/* Donut Chart with Centered Metric */}
      <div className="relative my-auto flex h-[150px] w-full items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-brand-ink/80 bg-brand-ink px-3 py-1.5 text-xs text-white shadow-xl">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold">{item.name}:</span>
                        <span>{item.value}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={46}
              outerRadius={64}
              paddingAngle={4}
              dataKey="value"
              stroke="transparent"
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Donut Label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-brand-ink">
            {percentage}%
          </span>
          <span className="text-[10px] font-medium text-brand-muted">
            {trained}/{total} Trained
          </span>
        </div>
      </div>

      {/* Legend Breakdown */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-brand-line/60 pt-3 text-xs">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-2 shrink-0 rounded-full bg-[#7363de]" />
          <span className="text-[11px] text-brand-muted">People:</span>
          <span className="font-semibold text-brand-ink">{peopleCount}</span>
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-2 shrink-0 rounded-full bg-[#3fd1c0]" />
          <span className="text-[11px] text-brand-muted">Things:</span>
          <span className="font-semibold text-brand-ink">{thingsCount}</span>
        </div>

        <AnimateIcon animateOnHover asChild><button
          type="button"
          onClick={onNavigateToUnlabeled}
          className="group inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-brand-violet transition hover:text-brand-violet-hover"
        >
          <span className="size-2 shrink-0 rounded-full bg-[#c9c4ee]" />
          <span className="text-[11px] text-brand-muted group-hover:text-brand-violet">Pending:</span>
          <span>{unlabeledCount} to name</span>
          <ArrowRight01Icon size={14} className="text-brand-violet transition-transform group-hover:translate-x-0.5" />
        </button></AnimateIcon>
      </div>
    </div>
  );
}
