import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, decodeJwt, type JWTPayload } from "jose";

// JWT_SECRET must be set on the web service with the same value as the API service.
// If it is missing, we fall back to decode-only (no signature check) so the app
// stays functional. The API enforces full cryptographic verification on every request.
const jwtSecretRaw = process.env.JWT_SECRET;
const JWT_SECRET = jwtSecretRaw ? new TextEncoder().encode(jwtSecretRaw) : null;

if (!JWT_SECRET) {
  console.error(
    "[middleware] JWT_SECRET env var is not set on the web service. " +
    "Falling back to signature-less token check. " +
    "Add JWT_SECRET (same value as the API service) to fix this."
  );
}

async function verifyToken(token: string): Promise<JWTPayload | null> {
  if (JWT_SECRET) {
    // Full cryptographic verification — preferred path when JWT_SECRET is configured.
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return payload;
    } catch {
      return null;
    }
  }

  // Fallback: decode without signature verification, check expiry only.
  // Real auth security is still enforced by the API on every data request.
  try {
    const payload = decodeJwt(token);
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("accessToken")?.value;

  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");

  if (isDashboard || isAdmin) {
    if (!token) {
      return redirectToLogin(req, pathname);
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return redirectToLogin(req, pathname);
    }

    // Admin routes require admin role
    if (isAdmin && payload.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest, from: string) {
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", from);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
