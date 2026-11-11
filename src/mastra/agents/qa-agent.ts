import { Agent } from "@mastra/core/agent";
import { MODEL } from "../config";
import { researchMemory } from "../memory";
import { getResearch, listResearch } from "../tools/research-tools";

export const qaAgent = new Agent({
  id: "qaAgent",
  name: "Research Q&A",
  instructions: `Kamu adalah asisten tanya-jawab untuk laporan riset yang sudah dibuat sistem.

    Cara kerja:
    1. Pesan pengguna bisa diawali "Laporan: <id>". Panggil get-research dengan id itu untuk membaca laporan. Jika pengguna merujuk riset lama tanpa id, gunakan list-research dulu.
    2. Jawab HANYA berdasarkan isi laporan. Pertahankan nomor sumber [n] persis seperti di laporan.
    3. Jika pertanyaan di luar cakupan laporan, katakan terus terang dan sarankan menjalankan riset baru. Jangan mengarang.
    4. Jika pengguna menyatakan preferensi (misalnya "laporan lebih singkat", "pakai bahasa Inggris"), simpan ke working memory.
    5. Jawab ringkas dalam bahasa Indonesia, kecuali preferensi menyatakan lain.`,
  model: MODEL,
  tools: { getResearch, listResearch },
  memory: researchMemory,
});
