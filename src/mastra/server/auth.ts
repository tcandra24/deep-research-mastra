import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Verifikasi JWT dari Neon Auth (Managed Better Auth) memakai JWKS publik.
//
// Env:
//   NEON_AUTH_BASE_URL  URL Neon Auth proyekmu. JWKS = {base}/.well-known/jwks.json,
//                       issuer dan audience = origin dari URL ini.
// Override (opsional, mis. untuk uji lokal):
//   AUTH_JWKS_URL, AUTH_ISSUER, AUTH_AUDIENCE, AUTH_ALGORITHMS (dipisah koma)

export class AuthConfigError extends Error {}

type AuthConfig = {
  jwks: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  algorithms: string[];
};

let cached: AuthConfig | undefined;

function getConfig(): AuthConfig {
  if (cached) return cached;

  const base = process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
  const jwksUrl = process.env.AUTH_JWKS_URL ?? (base ? `${base}/.well-known/jwks.json` : undefined);
  const origin = base ? new URL(base).origin : undefined;
  const issuer = process.env.AUTH_ISSUER ?? origin;
  const audience = process.env.AUTH_AUDIENCE ?? origin;

  // Gagal tertutup: tanpa konfigurasi, semua permintaan ditolak.
  if (!jwksUrl || !issuer || !audience) {
    throw new AuthConfigError("Autentikasi belum dikonfigurasi: isi NEON_AUTH_BASE_URL (atau AUTH_JWKS_URL, AUTH_ISSUER, AUTH_AUDIENCE).");
  }

  // Hanya algoritma asimetris. HS256 sengaja tidak diizinkan.
  const algorithms = (process.env.AUTH_ALGORITHMS ?? "EdDSA,ES256,RS256")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  cached = {
    jwks: createRemoteJWKSet(new URL(jwksUrl)),
    issuer,
    audience,
    algorithms,
  };
  return cached;
}

export async function verifyToken(token: string): Promise<{ userId: string }> {
  const cfg = getConfig();
  const { payload } = await jwtVerify(token, cfg.jwks, {
    issuer: cfg.issuer,
    audience: cfg.audience,
    algorithms: cfg.algorithms,
    clockTolerance: 5,
  });

  if (!payload.sub) throw new Error("Token tanpa sub");
  return { userId: payload.sub };
}
