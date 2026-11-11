import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { LIMITS } from "../config";

type TavilyResponse = {
  results?: { title: string; url: string; content: string }[];
};

export const webSearch = createTool({
  id: "web-search",
  description: "Cari informasi di web. Mengembalikan daftar hasil berisi judul, URL, dan cuplikan isi. Gunakan untuk menemukan sumber yang relevan dengan sebuah pertanyaan.",
  inputSchema: z.object({
    query: z.string().describe("Kata kunci pencarian yang singkat dan spesifik"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      }),
    ),
  }),
  execute: async ({ query }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY belum diisi di file .env");
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: LIMITS.maxResultsPerSearch,
        search_depth: "basic",
      }),
    });

    if (!res.ok) {
      throw new Error(`Pencarian gagal (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as TavilyResponse;
    return {
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      })),
    };
  },
});
