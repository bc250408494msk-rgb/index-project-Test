import { Resend } from "resend";
import { logger } from "../utils/logger.js";

const FROM = `${process.env.EMAIL_FROM_NAME ?? "IndexMeNow"} <${process.env.EMAIL_FROM ?? "noreply@indexmenow.com"}>`;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function send(to: string, subject: string, html: string) {
  const resend = getResend();
  if (!resend) {
    logger.warn({ to, subject }, "Email skipped — RESEND_API_KEY not set");
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    logger.error({ err, to, subject }, "Email send failed");
  }
}

export const emailService = {
  async sendWelcome(to: string, username: string) {
    await send(to, `Welcome to IndexMeNow, ${username}!`, `
      <h2>Welcome, ${username}!</h2>
      <p>Your account has been created. Start submitting URLs to get indexed faster.</p>
      <p><a href="${APP_URL}/dashboard">Go to Dashboard</a></p>
    `);
  },

  async sendEmailVerification(to: string, token: string) {
    const link = `${APP_URL}/verify-email?token=${token}`;
    await send(to, "Verify your email — IndexMeNow", `
      <h2>Verify your email address</h2>
      <p>Click the link below to verify your email. This link expires in 24 hours.</p>
      <p><a href="${link}">Verify Email</a></p>
      <p>If you didn't create this account, ignore this email.</p>
    `);
  },

  async sendPasswordReset(to: string, token: string) {
    const link = `${APP_URL}/reset-password?token=${token}`;
    await send(to, "Reset your password — IndexMeNow", `
      <h2>Password Reset Request</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>If you didn't request this, ignore this email.</p>
    `);
  },

  async sendUrlIndexed(to: string, url: string) {
    await send(to, "✅ Your URL is now indexed — IndexMeNow", `
      <h2>Great news! Your URL has been indexed.</h2>
      <p><strong>${url}</strong></p>
      <p>Google has confirmed this URL is now in its index.</p>
      <p><a href="${APP_URL}/dashboard">View Dashboard</a></p>
    `);
  },

  async sendHealthFailed(to: string, url: string, reasons: string[]) {
    await send(to, "⚠️ URL cannot be indexed — IndexMeNow", `
      <h2>Health Check Failed</h2>
      <p>We could not submit the following URL because it has indexing issues:</p>
      <p><strong>${url}</strong></p>
      <ul>${reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
      <p>No credits were charged. Fix the issues and re-submit.</p>
      <p><a href="${APP_URL}/dashboard">View Dashboard</a></p>
    `);
  },

  async sendRetryTriggered(to: string, url: string) {
    await send(to, "🔄 We re-submitted your URL — IndexMeNow", `
      <h2>7-Day Re-submission</h2>
      <p>Your URL has not been indexed after 7 days. We have re-submitted it automatically:</p>
      <p><strong>${url}</strong></p>
      <p>We will continue monitoring for 3 more days.</p>
      <p><a href="${APP_URL}/dashboard">View Dashboard</a></p>
    `);
  },

  async sendAutoRefund(to: string, url: string) {
    await send(to, "💳 Credit refunded — IndexMeNow", `
      <h2>Credit Auto-Refunded</h2>
      <p>Your URL was not indexed after 10 days, so we have refunded 1 credit:</p>
      <p><strong>${url}</strong></p>
      <p><a href="${APP_URL}/dashboard/credits">View Credit History</a></p>
    `);
  },

  async sendLowCredits(to: string, balance: number) {
    await send(to, "⚠️ Low credit balance — IndexMeNow", `
      <h2>Low Credit Alert</h2>
      <p>Your credit balance has dropped to <strong>${balance}</strong>.</p>
      <p>Contact your administrator to add more credits.</p>
      <p><a href="${APP_URL}/dashboard/credits">View Credits</a></p>
    `);
  },

  async sendCreditsGranted(to: string, amount: number, newBalance: number, reason: string) {
    await send(to, "💳 Credits added to your account — IndexMeNow", `
      <h2>Credits Added</h2>
      <p><strong>${amount > 0 ? `+${amount}` : amount} credits</strong> have been applied to your account.</p>
      <p>New balance: <strong>${newBalance}</strong></p>
      <p>Reason: ${reason}</p>
      <p><a href="${APP_URL}/dashboard/credits">View Credits</a></p>
    `);
  },
};
