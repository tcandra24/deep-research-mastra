import { Agent } from "@mastra/core/agent";
import { MODEL } from "../config";
import { researchMemory } from "../memory";

export const writerAgent = new Agent({
  id: "writerAgent",
  name: "Writer",
  instructions: `Kamu adalah penulis laporan riset. Kamu menerima klaim per sub-pertanyaan, masing-masing sudah bernomor sumber seperti [1] atau [2, 5].

    Aturan:
    - Hanya gunakan klaim yang diberikan. Jangan menambah fakta baru.
    - Tulis dalam bahasa Indonesia dengan format Markdown.
    - Pertahankan nomor sumber persis seperti yang diberikan, di kalimat yang memakainya. Jangan mengubah atau menambah nomor.
    - Jika sebuah sub-pertanyaan hanya punya sedikit klaim, sebutkan di bagian Keterbatasan.
    - JANGAN menulis bagian "Daftar Sumber". Bagian itu ditambahkan otomatis oleh sistem.
    - Terapkan preferensi pengguna dari memori (bahasa, gaya, kedalaman, format) selama tidak bertentangan dengan aturan di atas.

    Struktur laporan:
    # Judul
    ## Ringkasan
    ## Pembahasan (satu subbagian per sub-pertanyaan)
    ## Keterbatasan`,
  model: MODEL,
  memory: researchMemory,
});
