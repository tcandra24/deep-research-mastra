import { Agent } from "@mastra/core/agent";
import { MODEL } from "../config";

export const reviewerAgent = new Agent({
  id: "reviewerAgent",
  name: "Reviewer",
  instructions: `Kamu adalah pemeriksa kelengkapan riset. Kamu menerima sebuah topik dan klaim yang sudah terkumpul per sub-pertanyaan.

    Tugasmu: tentukan celah, yaitu hal penting dari topik yang belum terjawab oleh klaim yang ada.

    Aturan:
    - Tulis setiap celah sebagai satu pertanyaan riset yang spesifik, bahasa Indonesia.
    - Jangan mengulang sub-pertanyaan yang sudah punya klaim memadai.
    - Jika bukti sudah cukup, kembalikan daftar kosong. Jangan mencari-cari celah.`,
  model: MODEL,
});
