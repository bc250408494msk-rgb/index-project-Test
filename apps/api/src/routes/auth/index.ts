import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../../utils/prisma.js";
import { emailService } from "../../services/emailService.js";

const registerSchema = z.object({
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(128),
});

function signTokens(app: FastifyInstance, userId: string, role: string) {
  const accessToken = app.jwt.sign(
    { id: userId, role },
    { expiresIn: process.env.JWT_ACCESS_EXPIRY ?? "15m" }
  );
  const refreshToken = app.jwt.sign(
    { id: userId, role, type: "refresh" },
    { expiresIn: process.env.JWT_REFRESH_EXPIRY ?? "30d" }
  );
  return { accessToken, refreshToken };
}

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post("/register", {
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] },
    });
    if (existing) {
      return reply.status(409).send({ error: "Email or username already in use" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const verifyToken = randomBytes(32).toString("hex");
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
        emailVerifyToken: verifyToken,
        emailVerifyExpiresAt: verifyExpiry,
      },
    });

    await emailService.sendEmailVerification(user.email, verifyToken);

    return reply.status(201).send({ message: "Account created. Please verify your email." });
  });

  // GET /api/auth/verify-email/:token
  app.get("/verify-email/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token, emailVerifyExpiresAt: { gt: new Date() } },
    });
    if (!user) return reply.status(400).send({ error: "Invalid or expired verification token" });

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiresAt: null },
    });

    await emailService.sendWelcome(user.email, user.username);

    return reply.send({ message: "Email verified successfully" });
  });

  // POST /api/auth/login
  app.post("/login", {
    config: { rateLimit: { max: 50, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.email }] },
    });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    if (!user.isActive) return reply.status(403).send({ error: "Account is disabled" });

    if (!user.emailVerified) return reply.status(403).send({ error: "Please verify your email before signing in. Check your inbox or resend the verification email." });

    const { accessToken, refreshToken } = signTokens(app, user.id, user.role);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    reply
      .setCookie("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" })
      .setCookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth" })
      .send({
        user: { id: user.id, username: user.username, email: user.email, role: user.role, creditsBalance: user.creditsBalance },
        accessToken,
      });
  });

  // POST /api/auth/refresh
  app.post("/refresh", async (req, reply) => {
    const token = req.cookies?.refreshToken;
    if (!token) return reply.status(401).send({ error: "Refresh token missing" });

    try {
      const payload = app.jwt.verify(token) as { id: string; role: string; type: string };
      if (payload.type !== "refresh") throw new Error("Not a refresh token");

      const user = await prisma.user.findUnique({ where: { id: payload.id } });
      if (!user || !user.isActive) return reply.status(401).send({ error: "User not found or inactive" });

      const { accessToken, refreshToken } = signTokens(app, user.id, user.role);

      reply
        .setCookie("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" })
        .setCookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth" })
        .send({ accessToken });
    } catch {
      reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  // POST /api/auth/logout
  app.post("/logout", async (_req, reply) => {
    reply
      .clearCookie("accessToken", { path: "/" })
      .clearCookie("refreshToken", { path: "/api/auth" })
      .send({ message: "Logged out" });
  });

  // POST /api/auth/resend-verification
  app.post("/resend-verification", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && !user.emailVerified) {
      const token = randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken: token, emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      await emailService.sendEmailVerification(user.email, token);
    }

    return reply.send({ message: "If your email is registered and unverified, a new link has been sent." });
  });

  // POST /api/auth/forgot-password
  app.post("/forgot-password", {
    config: { rateLimit: { max: 20, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const { email } = forgotSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return 200 to prevent user enumeration
    if (user) {
      const token = randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await emailService.sendPasswordReset(user.email, token);
    }

    return reply.send({ message: "If an account with that email exists, a reset link has been sent." });
  });

  // POST /api/auth/reset-password
  app.post("/reset-password", async (req, reply) => {
    const { token, password } = resetSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpiresAt: { gt: new Date() } },
    });
    if (!user) return reply.status(400).send({ error: "Invalid or expired reset token" });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
    });

    return reply.send({ message: "Password reset successfully" });
  });
}
