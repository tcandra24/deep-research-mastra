import { Agent } from "@mastra/core/agent";
import { MODEL } from "../config";

export const plannerAgent = new Agent({
  id: "plannerAgent",
  name: "Planner",
  instructions: `Kamu adalah perencana riset. Dari sebuah topik, buat daftar sub-pertanyaan riset.

  Aturan:
  - Setiap sub-pertanyaan spesifik dan bisa dijawab lewat pencarian web.
  - Tidak tumpang tindih; bersama-sama harus mencakup topik secara utuh.
  - Tulis dalam bahasa Indonesia, satu kalimat tanya per item.`,
  model: MODEL,
});
