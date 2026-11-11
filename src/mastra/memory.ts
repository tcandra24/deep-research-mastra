import { Memory } from "@mastra/memory";
import { storage } from "./storage";

// Template working memory: catatan singkat tentang preferensi pengguna.
// Disimpan per "resource" (pengguna), sehingga berlaku di semua percakapan
// dan juga dibaca oleh writerAgent saat menyusun laporan.
export const researchMemory = new Memory({
  storage,
  options: {
    lastMessages: 10,
    workingMemory: {
      enabled: true,
      scope: "resource",
      template: `# Preferensi Riset
        - Bahasa laporan:
        - Gaya (ringkas / detail):
        - Kedalaman pembahasan:
        - Format favorit:
        - Catatan lain:
        `,
    },
  },
});
