import * as forge from "node-forge";
import * as tls from "tls";
import { logger } from "../../utils/logger.js";

export interface SslCheckResult {
  status: "pass" | "warn" | "fail";
  valid: boolean;
  expiryDays: number | null;
  message: string;
}

export async function sslCheck(url: string): Promise<SslCheckResult> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") {
      return { status: "fail", valid: false, expiryDays: null, message: "URL does not use HTTPS" };
    }

    const host = u.hostname;
    const port = parseInt(u.port || "443", 10);

    const cert = await new Promise<tls.PeerCertificate | null>((resolve) => {
      const socket = tls.connect({ host, port, servername: host, timeout: 5000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve(cert);
      });
      socket.on("error", () => resolve(null));
      socket.on("timeout", () => { socket.destroy(); resolve(null); });
    });

    if (!cert || !cert.valid_to) {
      return { status: "fail", valid: false, expiryDays: null, message: "Could not retrieve SSL certificate" };
    }

    const expiryDate = new Date(cert.valid_to);
    const now = new Date();
    const expiryDays = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (expiryDays < 0) {
      return { status: "fail", valid: false, expiryDays, message: `SSL certificate expired ${Math.abs(expiryDays)} days ago` };
    }

    if (expiryDays < 14) {
      return { status: "warn", valid: true, expiryDays, message: `SSL certificate expires in ${expiryDays} days — renew soon` };
    }

    return { status: "pass", valid: true, expiryDays, message: `SSL valid — ${expiryDays} days remaining` };
  } catch (err) {
    logger.warn({ err, url }, "SSL check error");
    return { status: "fail", valid: false, expiryDays: null, message: "SSL check failed" };
  }
}
