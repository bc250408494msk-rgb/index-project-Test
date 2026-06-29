import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock calls are hoisted to the top of the file by Vitest, so any variables
// they reference must be declared with vi.hoisted() to avoid "Cannot access
// before initialization" errors.
const { mockTx, mockPrisma, mockCacheDel, mockEmail } = vi.hoisted(() => {
  const mockTx = {
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    creditTransaction: { create: vi.fn() },
    url: { update: vi.fn() },
  };
  const mockPrisma = {
    $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
  };
  const mockCacheDel = vi.fn();
  const mockEmail = { sendLowCredits: vi.fn(), sendCreditsGranted: vi.fn(), sendAutoRefund: vi.fn() };
  return { mockTx, mockPrisma, mockCacheDel, mockEmail };
});

vi.mock("../../utils/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../utils/redis.js", () => ({ cacheDel: mockCacheDel, cacheGet: vi.fn(), cacheSet: vi.fn() }));
vi.mock("../../services/emailService.js", () => ({ emailService: mockEmail }));
vi.mock("../../utils/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { deductCredit, refundCredit, adminGrantCredits } from "./creditService.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    creditsBalance: 5,
    lowCreditThreshold: 2,
    notifyOnLowCredits: false,
    notifyOnCreditsGranted: false,
    ...overrides,
  };
}

// ── deductCredit ───────────────────────────────────────────────────────────

describe("deductCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)
    );
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeUser());
  });

  it("decrements the user balance inside a transaction", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 5 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await deductCredit("user-1", "url-1", "test charge");

    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creditsBalance: { decrement: 1 } }),
      })
    );
  });

  it("records a credit transaction with correct balanceBefore/After", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 3 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await deductCredit("user-1", "url-1", "submission");

    expect(mockTx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "charge",
          amount: -1,
          balanceBefore: 3,
          balanceAfter: 2,
        }),
      })
    );
  });

  it("marks the URL as creditCharged", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 5 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await deductCredit("user-1", "url-1", "test");

    expect(mockTx.url.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { creditCharged: true } })
    );
  });

  it("throws when the user has zero credits", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 0 }));

    await expect(deductCredit("user-1", "url-1", "test")).rejects.toThrow(
      "Insufficient credits"
    );
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });

  it("invalidates the Redis credit cache after deducting", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 2 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 1 }));

    await deductCredit("user-1", "url-1", "test");

    expect(mockCacheDel).toHaveBeenCalledWith("credits:user-1");
  });
});

// ── refundCredit ───────────────────────────────────────────────────────────

describe("refundCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)
    );
  });

  it("increments the user balance inside a transaction", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 0 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await refundCredit("user-1", "url-1");

    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { creditsBalance: { increment: 1 } },
      })
    );
  });

  it("records an auto_refund transaction", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 2 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await refundCredit("user-1", "url-1");

    expect(mockTx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "auto_refund",
          amount: 1,
          balanceBefore: 2,
          balanceAfter: 3,
        }),
      })
    );
  });

  it("sets url status to 'refunded' and creditRefunded to true", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 0 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await refundCredit("user-1", "url-1");

    expect(mockTx.url.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creditRefunded: true, status: "refunded" }),
      })
    );
  });

  it("invalidates the Redis credit cache", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 1 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});
    mockTx.url.update.mockResolvedValue({});

    await refundCredit("user-1", "url-1");

    expect(mockCacheDel).toHaveBeenCalledWith("credits:user-1");
  });
});

// ── adminGrantCredits ──────────────────────────────────────────────────────

describe("adminGrantCredits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)
    );
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 5 }));
  });

  it("grants credits with admin_grant transaction type", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 5 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});

    await adminGrantCredits("admin-1", "user-1", 10, "welcome bonus");

    expect(mockTx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "admin_grant",
          amount: 10,
          balanceBefore: 5,
          balanceAfter: 15,
          performedBy: "admin-1",
        }),
      })
    );
  });

  it("uses admin_deduct type for negative amounts", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 10 }));
    mockTx.user.update.mockResolvedValue({});
    mockTx.creditTransaction.create.mockResolvedValue({});

    await adminGrantCredits("admin-1", "user-1", -3, "correction");

    expect(mockTx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "admin_deduct", amount: -3 }),
      })
    );
  });

  it("throws when deduction would push balance below zero", async () => {
    mockTx.user.findUniqueOrThrow.mockResolvedValue(makeUser({ creditsBalance: 2 }));

    await expect(adminGrantCredits("admin-1", "user-1", -5, "oops")).rejects.toThrow(
      /negative balance/i
    );
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });
});
