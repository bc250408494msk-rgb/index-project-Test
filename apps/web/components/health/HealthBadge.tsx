"use client";

interface Props {
  status: "pass" | "warn" | "fail" | null;
  size?: "sm" | "md";
}

const CONFIG = {
  pass: { label: "Pass", className: "bg-green-100 text-green-700" },
  warn: { label: "Warn", className: "bg-yellow-100 text-yellow-700" },
  fail: { label: "Fail", className: "bg-red-100 text-red-700" },
  null: { label: "—", className: "bg-gray-100 text-gray-500" },
};

export function HealthBadge({ status, size = "sm" }: Props) {
  const cfg = CONFIG[status ?? "null"];
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";
  return <span className={`${cfg.className} ${sizeClass} rounded-full font-medium`}>{cfg.label}</span>;
}
