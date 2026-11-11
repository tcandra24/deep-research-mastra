// Format model router Mastra: "provider/model-id".
export const MODEL = process.env.RESEARCH_MODEL ?? "google/gemini-2.5-flash";

// Batas untuk menjaga biaya API tetap kecil saat belajar.
export const LIMITS = {
  maxSubQuestions: 4,
  maxResultsPerSearch: 5,
  maxPageChars: 6000,
  researchConcurrency: 3, // berapa sub-pertanyaan diriset bersamaan
  maxGaps: 2, // maksimal celah yang ditutup di putaran kedua
};

// Domain yang dianggap berkualitas rendah sebagai sumber riset.
export const BLOCKED_DOMAINS = ["pinterest.com", "quora.com", "facebook.com", "instagram.com", "tiktok.com"];

// Identitas pemilik memori. Satu pengguna = satu resource.
// Nanti (Tahap 8) diganti dengan id pengguna yang sedang login.
export const RESOURCE_ID = process.env.RESEARCH_USER_ID ?? "default-user";
