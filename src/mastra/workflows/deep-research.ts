import type { Mastra } from "@mastra/core";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { LIMITS, RESOURCE_ID } from "../config";
import { buildEvidence } from "../lib/evidence";
import { saveReport } from "../lib/research-store";
import { normalizeQuestion, sanitizeCitations, stripSourceSection } from "../lib/report";

const planSchema = z.object({
  subQuestions: z.array(z.string()),
});

const researchOutputSchema = z.object({
  claims: z.array(z.object({ text: z.string(), sourceUrls: z.array(z.string()) })),
  sources: z.array(z.object({ url: z.string(), title: z.string() })),
});

const researchResultSchema = researchOutputSchema.extend({
  question: z.string(),
});

const gapSchema = z.object({
  gaps: z.array(z.string()),
});

const resultsSchema = z.object({
  topic: z.string(),
  results: z.array(researchResultSchema),
});

// Cabang A: ada celah -> riset putaran kedua (paralel), gabungkan hasilnya.
const reviewedSchema = resultsSchema.extend({ gaps: z.array(z.string()) });

const evidenceSchema = z.object({
  topic: z.string(),
  sources: z.array(z.object({ id: z.number(), title: z.string(), url: z.string() })),
  sections: z.array(
    z.object({
      question: z.string(),
      claims: z.array(z.object({ text: z.string(), ids: z.array(z.number()) })),
    }),
  ),
  droppedClaims: z.number(),
});

// Step 1: topik -> daftar sub-pertanyaan (structured output)
const planStep = createStep({
  id: "plan",
  description: "Memecah topik menjadi sub-pertanyaan riset",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({
    topic: z.string(),
    subQuestions: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    const planner = mastra.getAgent("plannerAgent");
    const result = await planner.generate(`Topik riset: ${inputData.topic}\nBuat maksimal ${LIMITS.maxSubQuestions} sub-pertanyaan.`, { structuredOutput: { schema: planSchema } });

    const parsed = planSchema.safeParse(result.object);
    const subQuestions = parsed.success ? parsed.data.subQuestions.filter((q) => q.trim().length > 0) : [];

    if (subQuestions.length === 0) {
      console.warn("[plan] keluaran tidak valid, memakai topik sebagai satu pertanyaan");
      return { topic: inputData.topic, subQuestions: [inputData.topic] };
    }

    return {
      topic: inputData.topic,
      subQuestions: subQuestions.slice(0, LIMITS.maxSubQuestions),
    };
  },
});

// ===== BARU (Tahap 6) =====
// Step 1b: human-in-the-loop. Workflow BERHENTI (suspend) di sini sampai
// manusia menyetujui, mengubah, atau menolak rencana sub-pertanyaan.
const planDataSchema = z.object({
  topic: z.string(),
  subQuestions: z.array(z.string()),
});

const approvePlanStep = createStep({
  id: "approve-plan",
  description: "Menunggu persetujuan manusia atas rencana riset",
  inputSchema: planDataSchema,
  outputSchema: planDataSchema,
  // Data yang ditampilkan ke manusia saat workflow berhenti
  suspendSchema: z.object({
    reason: z.string(),
    topic: z.string(),
    subQuestions: z.array(z.string()),
  }),
  // Data yang harus dikirim manusia untuk melanjutkan
  resumeSchema: z.object({
    approved: z.boolean(),
    // Opsional: daftar sub-pertanyaan hasil suntingan
    subQuestions: z.array(z.string()).optional(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    // Eksekusi pertama: belum ada keputusan -> berhenti dan tunggu.
    if (!resumeData) {
      return await suspend({
        reason: "Setujui, ubah, atau tolak rencana sub-pertanyaan sebelum riset dimulai.",
        topic: inputData.topic,
        subQuestions: inputData.subQuestions,
      });
    }

    // Eksekusi setelah resume: ada keputusan.
    if (!resumeData.approved) {
      throw new Error("Rencana riset ditolak oleh pengguna.");
    }

    const subQuestions = (resumeData.subQuestions ?? inputData.subQuestions)
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .slice(0, LIMITS.maxSubQuestions);

    if (subQuestions.length === 0) {
      throw new Error("Daftar sub-pertanyaan kosong setelah disunting.");
    }

    return { topic: inputData.topic, subQuestions };
  },
});
// ===== akhir BARU (Tahap 6) =====

// Helper: satu putaran riset untuk satu pertanyaan.
// Model kadang gagal menghasilkan data terstruktur (misalnya kehabisan
// langkah tool), jadi hasilnya divalidasi, dicoba ulang sekali, dan
// jika tetap gagal dikembalikan kosong agar workflow tidak berhenti.
async function researchQuestion(mastra: Mastra, topic: string, question: string) {
  const researcher = mastra.getAgent("researcherAgent");
  const basePrompt = `Topik besar: ${topic}\nPertanyaan yang harus dijawab: ${question}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Percobaan kedua diberi petunjuk agar lebih ringkas dan pasti menjawab.
    const prompt = attempt === 1 ? basePrompt : `${basePrompt}\n\nCatatan: lakukan maksimal 3 pencarian, lalu WAJIB akhiri dengan data terstruktur sesuai skema.`;

    try {
      const result = await researcher.generate(prompt, {
        structuredOutput: { schema: researchOutputSchema },
        maxSteps: 8, // izinkan beberapa putaran search/fetch sebelum menjawab
      });

      const parsed = researchOutputSchema.safeParse(result.object);
      if (parsed.success) return { question, ...parsed.data };

      console.warn(`[research] percobaan ${attempt} tidak valid: ${question}`);
    } catch (err) {
      console.warn(`[research] percobaan ${attempt} error: ${question}`, err);
    }
  }

  return { question, claims: [], sources: [] };
}

// Step 2: riset SATU sub-pertanyaan. Dijalankan per item oleh .foreach().
const researchOneStep = createStep({
  id: "research-one",
  description: "Meriset satu sub-pertanyaan, hasilnya klaim + sumber",
  inputSchema: z.object({ topic: z.string(), question: z.string() }),
  outputSchema: researchResultSchema,
  execute: async ({ inputData, mastra }) => researchQuestion(mastra, inputData.topic, inputData.question),
});

// Step 2b: periksa kelengkapan. Hasil riset diteruskan + daftar celah.
const reviewStep = createStep({
  id: "review",
  description: "Memeriksa apakah ada celah yang belum terjawab",
  inputSchema: resultsSchema,
  outputSchema: resultsSchema.extend({ gaps: z.array(z.string()) }),
  execute: async ({ inputData, mastra }) => {
    const reviewer = mastra.getAgent("reviewerAgent");

    const summary = inputData.results.map((r, i) => `Sub-pertanyaan ${i + 1}: ${r.question}\n` + (r.claims.map((c) => `- ${c.text}`).join("\n") || "- (belum ada klaim)")).join("\n\n");

    let proposed: string[] = [];
    try {
      const result = await reviewer.generate(`Topik: ${inputData.topic}\n\n${summary}\n\nApa celah yang masih ada?`, { structuredOutput: { schema: gapSchema } });
      const parsed = gapSchema.safeParse(result.object);
      if (parsed.success) proposed = parsed.data.gaps;
      else console.warn("[review] keluaran tidak valid, dianggap tanpa celah");
    } catch (err) {
      console.warn("[review] error, dianggap tanpa celah", err);
    }

    // Buang celah kosong, kembar, atau sama dengan sub-pertanyaan awal.
    const seen = new Set(inputData.results.map((r) => normalizeQuestion(r.question)));
    const gaps: string[] = [];
    for (const gap of proposed) {
      const key = normalizeQuestion(gap);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      gaps.push(gap);
    }

    return { ...inputData, gaps: gaps.slice(0, LIMITS.maxGaps) };
  },
});

const fillGapsStep = createStep({
  id: "fill-gaps",
  description: "Putaran riset kedua untuk menutup celah",
  inputSchema: reviewedSchema,
  outputSchema: resultsSchema,
  execute: async ({ inputData, mastra }) => {
    const extra = await Promise.all(inputData.gaps.map((gap) => researchQuestion(mastra, inputData.topic, gap)));
    return {
      topic: inputData.topic,
      results: [...inputData.results, ...extra],
    };
  },
});

// Cabang B: tidak ada celah -> teruskan apa adanya.
const skipGapsStep = createStep({
  id: "skip-gaps",
  description: "Tidak ada celah, lanjut",
  inputSchema: reviewedSchema,
  outputSchema: resultsSchema,
  execute: async ({ inputData }) => ({
    topic: inputData.topic,
    results: inputData.results,
  }),
});

// Step 3: saring sumber (tanpa LLM, murni kode) dan nomori ulang global.
const filterStep = createStep({
  id: "filter-sources",
  description: "Buang sumber duplikat/berkualitas rendah, nomori ulang",
  inputSchema: resultsSchema,
  outputSchema: evidenceSchema,
  execute: async ({ inputData }) => {
    const evidence = buildEvidence(inputData.results);
    if (evidence.droppedClaims > 0) {
      console.warn(`[filter-sources] ${evidence.droppedClaims} klaim dibuang karena tanpa sumber valid`);
    }
    return { topic: inputData.topic, ...evidence };
  },
});

// Step 4: tulis laporan. Daftar sumber dibuat oleh kode, bukan oleh LLM,
// sehingga URL tidak mungkin dikarang.
const writeStep = createStep({
  id: "write",
  description: "Menyusun laporan akhir dari bukti yang sudah disaring",
  inputSchema: evidenceSchema,
  outputSchema: z.object({
    topic: z.string(),
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    // Tanpa bukti, writer bisa mengarang laporan yang terdengar meyakinkan.
    const totalClaims = inputData.sections.reduce((n, section) => n + section.claims.length, 0);
    if (totalClaims === 0) {
      throw new Error("Tidak ada klaim bersumber yang lolos penyaringan; laporan tidak dibuat.");
    }

    const writer = mastra.getAgent("writerAgent");

    const material = inputData.sections
      .map((section, i) => {
        const lines = section.claims.map((c) => `- ${c.text} [${c.ids.join(", ")}]`).join("\n");
        return `### Sub-pertanyaan ${i + 1}: ${section.question}\n${lines || "(tidak ada klaim yang lolos penyaringan)"}`;
      })
      .join("\n\n");

    const result = await writer.generate(`Topik: ${inputData.topic}\n\nKlaim:\n${material}\n\nTulis laporan akhirnya.`);

    // Rapikan keluaran writer: buang sitasi yang tidak ada di daftar sumber
    // dan buang "Daftar Sumber" buatan model (yang resmi dibuat kode).
    const body = sanitizeCitations(stripSourceSection(result.text), inputData.sources.length);

    const sourceList = inputData.sources.map((s) => `${s.id}. [${s.title}](${s.url})`).join("\n");

    return {
      topic: inputData.topic,
      report: `${body}\n\n## Daftar Sumber\n${sourceList}`,
    };
  },
});

// ===== BARU (Tahap 7) =====
// Step 5: simpan laporan agar bisa ditanya ulang oleh qaAgent.
// Id laporan = runId, jadi mudah ditelusuri ke run workflow-nya.
const saveStep = createStep({
  id: "save-report",
  description: "Menyimpan laporan akhir ke database",
  inputSchema: z.object({ topic: z.string(), report: z.string() }),
  outputSchema: z.object({
    topic: z.string(),
    report: z.string(),
    reportId: z.string(),
  }),
  execute: async ({ inputData, runId }) => {
    await saveReport({ id: runId, topic: inputData.topic, report: inputData.report });
    return { ...inputData, reportId: runId };
  },
});
// ===== akhir BARU (Tahap 7) =====

export const deepResearchWorkflow = createWorkflow({
  id: "deepResearchWorkflow",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ topic: z.string(), report: z.string() }),
})
  .then(planStep)
  // BARU (Tahap 6): berhenti di sini sampai manusia menyetujui rencana
  .then(approvePlanStep)
  // Ubah sub-pertanyaan menjadi array item untuk .foreach()
  .map(async ({ inputData }) =>
    inputData.subQuestions.map((question) => ({
      topic: inputData.topic,
      question,
    })),
  )
  // Riset tiap item, maksimal N sekaligus
  .foreach(researchOneStep, { concurrency: LIMITS.researchConcurrency })
  // Kumpulkan hasil array + ambil kembali topik dari input awal
  .map(async ({ inputData, getInitData }) => ({
    topic: (getInitData() as { topic: string }).topic,
    results: inputData,
  }))
  // Periksa kelengkapan, lalu pilih cabang berdasarkan ada/tidaknya celah
  .then(reviewStep)
  .branch([
    [async ({ inputData }) => inputData.gaps.length > 0, fillGapsStep],
    [async ({ inputData }) => inputData.gaps.length === 0, skipGapsStep],
  ])
  // Output .branch() berbentuk { "fill-gaps"?: ..., "skip-gaps"?: ... }
  .map(async ({ inputData }) => {
    const merged = inputData["fill-gaps"] ?? inputData["skip-gaps"];
    if (!merged) throw new Error("Tidak ada cabang yang dijalankan");
    return merged;
  })
  .then(filterStep)
  .then(writeStep)
  .then(saveStep)
  .commit();
