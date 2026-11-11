import { BLOCKED_DOMAINS } from "../config";
import { normalizeQuestion } from "./report";

export type RawClaim = { text: string; sourceUrls: string[] };
export type RawSource = { url: string; title: string };
export type ResearchResult = {
  question: string;
  claims: RawClaim[];
  sources: RawSource[];
};

export type Source = { id: number; title: string; url: string };
export type EvidenceClaim = { text: string; ids: number[] };
export type EvidenceSection = {
  question: string;
  claims: EvidenceClaim[];
};

// Samakan bentuk URL agar duplikat terdeteksi:
// buang #hash, parameter pelacak, "www.", dan "/" di akhir.
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") {
        u.searchParams.delete(key);
      }
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    const s = u.toString();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  } catch {
    return null;
  }
}

export function isBlocked(url: string): boolean {
  const host = new URL(url).hostname;
  return BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Menyaring sumber (buang duplikat + domain rendah), menomori ulang secara
// global, dan membuang klaim kembar. Klaim yang semua sumbernya terbuang
// ikut dibuang.
export function buildEvidence(results: ResearchResult[]): {
  sources: Source[];
  sections: EvidenceSection[];
  droppedClaims: number;
} {
  const idByUrl = new Map<string, number>();
  const sources: Source[] = [];
  const claimByText = new Map<string, EvidenceClaim>();
  let droppedClaims = 0;

  const sections: EvidenceSection[] = results.map((result) => {
    // Hanya URL yang tercantum di daftar sumber hasil riset yang dipercaya.
    const titleByUrl = new Map<string, string>();
    for (const s of result.sources) {
      const url = normalizeUrl(s.url);
      if (url && !isBlocked(url)) titleByUrl.set(url, s.title);
    }

    const claims: EvidenceClaim[] = [];
    for (const claim of result.claims) {
      const ids = new Set<number>();
      for (const raw of claim.sourceUrls) {
        const url = normalizeUrl(raw);
        if (!url || !titleByUrl.has(url)) continue;

        let id = idByUrl.get(url);
        if (id === undefined) {
          id = sources.length + 1;
          idByUrl.set(url, id);
          sources.push({ id, title: titleByUrl.get(url) ?? url, url });
        }
        ids.add(id);
      }

      if (ids.size === 0) {
        droppedClaims++;
        continue;
      }

      // Klaim kembar (di bagian lain): gabungkan nomor sumbernya ke klaim
      // pertama, jangan ditampilkan dua kali.
      const key = normalizeQuestion(claim.text);
      const existing = claimByText.get(key);
      if (existing) {
        existing.ids = [...new Set([...existing.ids, ...ids])].sort((a, b) => a - b);
        continue;
      }

      const entry: EvidenceClaim = {
        text: claim.text,
        ids: [...ids].sort((a, b) => a - b),
      };
      claimByText.set(key, entry);
      claims.push(entry);
    }

    return { question: result.question, claims };
  });

  return { sources, sections, droppedClaims };
}
