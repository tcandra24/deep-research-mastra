import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "@mastra/core/server";
import { AuthConfigError, verifyToken } from "./auth";

const API_PREFIX = "/api"; // prefix rute bawaan Mastra (default)

// Rute buatan kita (lihat routes.ts). Semuanya wajib JWT.
const CUSTOM_PREFIXES = ["/research", "/reports"];

const startsWithPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Perlindungan untuk semua rute kecuali yang publik (mis. /health bawaan
// Mastra):
//
// 1. Rute bawaan Mastra (/api/*) membuka SEMUA agent dan workflow tanpa cek
//    pemilik. Dari browser, rute ini ditutup. Hanya bisa dibuka dengan header
//    x-admin-key (env ADMIN_API_KEY) atau, untuk `mastra dev` lokal, dengan
//    ALLOW_STUDIO_API=true di .env.
// 2. Dengan ALLOW_STUDIO_API=true (lokal), halaman Studio (path non-/api yang
//    bukan rute kita) juga dibuka agar Studio bisa dimuat di browser.
// 3. Rute buatan kita, dan semua path lain, wajib membawa JWT yang valid.
//    userId diambil dari klaim "sub" dan disimpan di requestContext.
export const securityMiddleware: MiddlewareHandler = async (c, next) => {
  // Preflight CORS dijawab oleh konfigurasi CORS, tanpa token.
  if (c.req.method === "OPTIONS") return next();

  const path = c.req.path;
  const studioDev = process.env.ALLOW_STUDIO_API === "true";

  if (startsWithPrefix(path, API_PREFIX)) {
    if (sameSecret(c.req.header("x-admin-key"), process.env.ADMIN_API_KEY)) return next();
    if (studioDev) return next();
    return c.json({ error: "Forbidden" }, 403);
  }

  // Halaman dan aset Studio (hanya lokal). Rute kita tetap wajib JWT.
  const isCustom = CUSTOM_PREFIXES.some((p) => startsWithPrefix(path, p));
  if (studioDev && !isCustom) return next();

  const match = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "");
  if (!match) return c.json({ error: "Perlu login." }, 401);

  // Data pengguna diteruskan lewat requestContext milik Mastra
  // (c.set biasa tidak terlihat oleh handler rute kustom).
  const requestContext = (c as any).get("requestContext") as { set(key: string, value: unknown): void } | undefined;
  if (!requestContext) {
    console.error("[auth] requestContext tidak tersedia di middleware");
    return c.json({ error: "Konfigurasi server tidak valid." }, 500);
  }

  try {
    const { userId } = await verifyToken(match[1]);
    requestContext.set("userId", userId);
  } catch (err) {
    if (err instanceof AuthConfigError) {
      console.error(`[auth] ${err.message}`);
      return c.json({ error: "Autentikasi belum dikonfigurasi di server." }, 503);
    }
    return c.json({ error: "Token tidak valid atau kedaluwarsa." }, 401);
  }

  await next();
};
