import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { LIMITS } from "../config";

const MAX_REDIRECTS = 3;

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, termasuk metadata cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast & reserved
  );
}

function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return true; // bukan IP valid: tolak
}

// Hanya http/https, dan hostname harus mengarah ke IP publik
// (dicek setelah DNS di-resolve) supaya agent tidak bisa dipancing
// membuka layanan internal (SSRF).
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL tidak valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Hanya http/https yang diizinkan.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Alamat lokal tidak diizinkan.");
  }

  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error("Domain tidak dapat di-resolve.");
      });

  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("Alamat privat/internal tidak diizinkan.");
  }
  return url;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export const fetchPage = createTool({
  id: "fetch-page",
  description: "Ambil isi teks sebuah halaman web dari URL. Gunakan hanya untuk 1-2 sumber terbaik hasil pencarian yang butuh detail lebih dari cuplikan.",
  inputSchema: z.object({
    url: z.string().describe("URL lengkap, diawali http:// atau https://"),
  }),
  outputSchema: z.object({
    url: z.string(),
    text: z.string(),
    truncated: z.boolean(),
  }),
  execute: async (inputData) => {
    let current = await assertPublicUrl(inputData.url);
    let res: Response | undefined;

    // Redirect diikuti manual agar setiap lompatan diperiksa ulang.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": "deep-research-mastra/0.1" },
        signal: AbortSignal.timeout(10_000),
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop === MAX_REDIRECTS) throw new Error("Terlalu banyak redirect.");
        current = await assertPublicUrl(new URL(location, current).toString());
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      throw new Error(`Gagal mengambil halaman (${res?.status ?? "tanpa respons"})`);
    }

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|application\/xhtml/i.test(type)) {
      throw new Error(`Tipe konten tidak didukung: ${type || "tidak diketahui"}`);
    }

    const text = htmlToText(await res.text());
    const truncated = text.length > LIMITS.maxPageChars;
    return {
      url: current.toString(),
      text: truncated ? text.slice(0, LIMITS.maxPageChars) : text,
      truncated,
    };
  },
});
