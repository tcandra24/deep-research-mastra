// Fungsi bantu murni (tanpa LLM) untuk merapikan keluaran model.

// Samakan bentuk pertanyaan agar duplikat terdeteksi:
// huruf kecil, tanpa tanda baca, spasi dirapatkan.
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Buang nomor sitasi yang tidak ada di daftar sumber, misalnya [7]
// padahal sumber hanya 5. Sitasi yang jadi kosong dihapus seluruhnya.
export function sanitizeCitations(text: string, maxId: number): string {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_match, list: string) => {
    const ids = list
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= maxId);
    return ids.length > 0 ? `[${ids.join(", ")}]` : "";
  });
}

// Jika writer tetap menulis "Daftar Sumber" sendiri, potong bagian itu
// karena daftar resmi ditambahkan oleh kode.
export function stripSourceSection(text: string): string {
  return text.replace(/\n#{1,6}\s*Daftar Sumber[\s\S]*$/i, "").trimEnd();
}
