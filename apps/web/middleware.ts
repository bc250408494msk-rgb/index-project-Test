import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
