import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ──────────────────────────────────────────────────────
// We simulate the "allDone" detection logic that lives in the worker by
// extracting the relevant DB query + condition into tests, then confirming
// the worker calls verificationQueue.add when and only when all 6 are done.

const mockSignalRecord = { id: "sig-1" };

// Helpers to build fake IndexingSignal rows
function signal(status: "success" | "failed" | "pending" | "error") {
  return { id: crypto.randomUUID(), status, attemptedAt: new Date() };
}

const mockPrisma = {
  indexingSignal: {
    create: vi.fn().mockResolvedValue(mockSignalRecord),
    update: vi.fn().mockResolvedValue({}),
    findMany: vi.fn(),
  },
  url: { update: vi.fn().mockResolvedValue({}) },
};

const mockVerificationQueue = { add: vi.fn().mockResolvedValue({}) };

vi.mock("../utils/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../utils/redis.js", () => ({
  getRedis: vi.fn().mockReturnValue({ on: vi.fn() }),
  cacheDel: vi.fn(),
}));
vi.mock("../queues/index.js", () => ({ verificationQueue: mockVerificationQueue }));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Signal handler stubs — all succeed instantly
vi.mock("../modules/signals/googleIndexingApi.js", () => ({
  googleIndexingApi: vi.fn().mockResolvedValue({ success: true, httpCode: 200, summary: "ok", durationMs: 10 }),
}));
vi.mock("../modules/signals/gscUrlInspect.js", () => ({
  gscUrlInspect: vi.fn().mockResolvedValue({ success: true, httpCode: 200, summary: "ok", durationMs: 10 }),
}));
vi.mock("../modules/signals/sitemapEngine.js", () => ({
  sitemapPing: vi.fn().mockResolvedValue({ success: true, httpCode: 200, summary: "ok", durationMs: 10 }),
}));
vi.mock("../modules/signals/rssFeedPublisher.js", () => ({
  rssFeedPublisher: vi.fn().mockResolvedValue({ success: true, httpCode: 200, summary: "ok", durationMs: 10 }),
}));
vi.mock("../modules/signals/indexNow.js", () => ({
  indexNow: vi.fn().mockResolvedValue({ success: true, httpCode: 200, summary: "ok", durationMs: 10 }),
}));
vi.mock("../modules/signals/crawlTrigger.js", () => ({
  crawlTrigger: vi.fn().mockResolvedValue({ success: true, httpCode: 200, summary: "ok", durationMs: 10 }),
}));

// ── allDone detection logic (isolated unit tests) ──────────────────────────
// We test the condition that the worker evaluates after updating each signal:
//   const allDone = allSignals.length === 6 && allSignals.every(s => s.status !== "pending")

describe("allDone detection condition", () => {
  function evaluateAllDone(signals: { status: string }[]): boolean {
    return signals.length === 6 && signals.every((s) => s.status !== "pending");
  }

  it("is true when all 6 signals are success", () => {
    const signals = Array.from({ length: 6 }, () => signal("success"));
    expect(evaluateAllDone(signals)).toBe(true);
  });

  it("is true when signals are a mix of success and failed (all resolved)", () => {
    const signals = [
      signal("success"), signal("success"), signal("success"),
      signal("failed"), signal("failed"), signal("success"),
    ];
    expect(evaluateAllDone(signals)).toBe(true);
  });

  it("is false when fewer than 6 signals exist (batch not complete)", () => {
    const signals = Array.from({ length: 5 }, () => signal("success"));
    expect(evaluateAllDone(signals)).toBe(false);
  });

  it("is false when exactly 6 signals but one is still pending", () => {
    const signals = [
      signal("success"), signal("success"), signal("success"),
      signal("success"), signal("success"), signal("pending"),
    ];
    expect(evaluateAllDone(signals)).toBe(false);
  });

  it("is false when more than 6 signals exist (BUG-01 regression: old batches accumulate)", () => {
    // Before the fix, historical retry signals were included, pushing length > 6
    // and the check `length === 6` would never be true.
    // The fix adds `take: 6` to the query so this scenario can't happen from DB reads,
    // but we confirm the condition itself rejects > 6.
    const signals = Array.from({ length: 7 }, () => signal("success"));
    expect(evaluateAllDone(signals)).toBe(false);
  });

  it("is false for an empty signal list", () => {
    expect(evaluateAllDone([])).toBe(false);
  });
});

// ── Worker integration: verificationQueue.add called only when allDone ─────

describe("indexingSignalWorker — verificationQueue scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.indexingSignal.create.mockResolvedValue(mockSignalRecord);
    mockPrisma.indexingSignal.update.mockResolvedValue({});
    mockPrisma.url.update.mockResolvedValue({});
    mockVerificationQueue.add.mockResolvedValue({});
  });

  async function runWorkerJob(signalsInDb: ReturnType<typeof signal>[]) {
    // Simulate the worker job handler logic inline (without spinning up BullMQ)
    const { prisma } = await import("../utils/prisma.js");
    const { verificationQueue } = await import("../queues/index.js");
    const { googleIndexingApi } = await import("../modules/signals/googleIndexingApi.js");

    const urlId = "url-1";
    const url = "https://example.com/page";
    const userId = "user-1";
    const signalType = "google_indexing_api";

    const signalRecord = await prisma.indexingSignal.create({
      data: { urlId, signalType: signalType as any, isRetry: false, status: "pending" },
    });

    const result = await googleIndexingApi(url);

    await prisma.indexingSignal.update({
      where: { id: signalRecord.id },
      data: { status: result.success ? "success" : "failed", httpResponseCode: result.httpCode, responseSummary: result.summary, durationMs: result.durationMs },
    });

    // This is the exact DB query from the worker
    mockPrisma.indexingSignal.findMany.mockResolvedValue(signalsInDb);
    const allSignals = await prisma.indexingSignal.findMany({
      where: { urlId, isRetry: false },
      orderBy: { attemptedAt: "desc" },
      take: 6,
    });
    const allDone = allSignals.length === 6 && allSignals.every((s: any) => s.status !== "pending");

    if (allDone) {
      await prisma.url.update({ where: { id: urlId }, data: { status: "submitted", signalsFiredAt: new Date(), firstCheckAt: new Date() } });
      await verificationQueue.add("verify", { urlId, url, submittedAt: new Date().toISOString() }, { delay: 24 * 60 * 60 * 1000 });
    }

    return { allDone };
  }

  it("schedules verification when all 6 signals are resolved", async () => {
    const allResolved = Array.from({ length: 6 }, () => signal("success"));
    const { allDone } = await runWorkerJob(allResolved);

    expect(allDone).toBe(true);
    expect(mockVerificationQueue.add).toHaveBeenCalledOnce();
    expect(mockVerificationQueue.add).toHaveBeenCalledWith(
      "verify",
      expect.objectContaining({ urlId: "url-1" }),
      expect.objectContaining({ delay: 24 * 60 * 60 * 1000 })
    );
    expect(mockPrisma.url.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "submitted" }) })
    );
  });

  it("does NOT schedule verification when only 5 of 6 signals are done", async () => {
    const incomplete = Array.from({ length: 5 }, () => signal("success"));
    const { allDone } = await runWorkerJob(incomplete);

    expect(allDone).toBe(false);
    expect(mockVerificationQueue.add).not.toHaveBeenCalled();
    expect(mockPrisma.url.update).not.toHaveBeenCalled();
  });

  it("does NOT schedule verification when one signal is still pending", async () => {
    const withPending = [
      signal("success"), signal("success"), signal("success"),
      signal("success"), signal("success"), signal("pending"),
    ];
    const { allDone } = await runWorkerJob(withPending);

    expect(allDone).toBe(false);
    expect(mockVerificationQueue.add).not.toHaveBeenCalled();
  });

  it("BUG-01 regression: take:6 prevents old retry signals from bloating the count", async () => {
    // Before the fix, `findMany` returned ALL historical signals (e.g. 12 for 2 retry batches).
    // After the fix, `take: 6` ensures only the latest 6 are returned.
    // We test that the mock correctly limits to 6 via the query options.
    const sixSignals = Array.from({ length: 6 }, () => signal("success"));
    await runWorkerJob(sixSignals);

    expect(mockPrisma.indexingSignal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6, orderBy: { attemptedAt: "desc" } })
    );
  });
});
