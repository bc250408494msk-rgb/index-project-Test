"use client";

import { HealthBadge } from "./HealthBadge";

export interface HealthCheckResult {
  url: string;
  isIndexable: boolean;
  overallStatus: "pass" | "warn" | "fail";
  checks: {
    httpStatus: { status: string };
    ssl: { status: string };
    robotsTxt: { status: string };
    noindex: { status: string };
    canonical: { status: string };
    redirect: { status: string };
    content: { status: string };
  };
  failReasons: string[];
  warnings: string[];
}

interface Props {
  results: HealthCheckResult[];
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const COLUMNS: { key: keyof HealthCheckResult["checks"]; label: string }[] = [
  { key: "httpStatus", label: "HTTP" },
  { key: "ssl", label: "SSL" },
  { key: "robotsTxt", label: "Robots" },
  { key: "noindex", label: "Noindex" },
  { key: "canonical", label: "Canonical" },
  { key: "redirect", label: "Redirect" },
  { key: "content", label: "Content" },
];

export function HealthCheckTable({ results, onConfirm, onBack, isSubmitting }: Props) {
  const passCount = results.filter((r) => r.isIndexable).length;
  const failCount = results.length - passCount;

  return (
    <div className="bg-white rounded-xl border">
      <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Health Check Results</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="text-green-600 font-medium">{passCount} will be submitted</span>
            {failCount > 0 && (
              <span className="text-red-500 ml-2">· {failCount} failed (no credit charged)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            onClick={onBack}
            disabled={isSubmitting}
          >
            Back
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            onClick={onConfirm}
            disabled={passCount === 0 || isSubmitting}
          >
            {isSubmitting ? "Submitting…" : `Submit ${passCount} URL${passCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">URL</th>
              {COLUMNS.map(({ label }) => (
                <th key={label} className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
                  {label}
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium text-gray-600">Overall</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((r) => (
              <tr key={r.url} className={r.isIndexable ? "" : "bg-red-50"}>
                <td className="px-4 py-2.5 max-w-xs">
                  <p className="truncate text-gray-800 font-mono text-xs">{r.url}</p>
                  {r.failReasons[0] && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{r.failReasons[0]}</p>
                  )}
                </td>
                {COLUMNS.map(({ key }) => (
                  <td key={key} className="px-3 py-2.5 text-center">
                    <HealthBadge status={r.checks[key].status as "pass" | "warn" | "fail"} />
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <HealthBadge status={r.overallStatus} size="md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
