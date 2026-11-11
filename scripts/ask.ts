import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { mastra } from "../src/mastra";
import { RESOURCE_ID } from "../src/mastra/config";
import { getReport } from "../src/mastra/lib/research-store";

async function main() {
  const reportId = process.argv[2];
  if (!reportId) {
    console.error("Pemakaian: npm run ask -- <reportId>");
    process.exit(1);
  }

  const saved = await getReport(reportId);
  if (!saved) {
    console.error(`Laporan ${reportId} tidak ditemukan.`);
    process.exit(1);
  }

  const agent = mastra.getAgent("qaAgent");
  console.log(`Tanya jawab untuk riset: ${saved.topic}`);
  console.log("Ketik pertanyaan. Baris kosong untuk selesai.\n");

  // Satu thread per laporan: riwayat percakapan tersimpan di memory.
  // Satu resource per pengguna: preferensi (working memory) dibagi ke semua thread.
  const memory = { resource: RESOURCE_ID, thread: reportId };

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();

  while (true) {
    process.stdout.write("> ");
    const next = await lines.next();
    const question = next.done ? "" : String(next.value).trim();
    if (!question) break;

    const result = await agent.generate(`Laporan: ${reportId}\nPertanyaan: ${question}`, { memory });
    console.log(`\n${result.text}\n`);
  }

  rl.close();
}

main();
