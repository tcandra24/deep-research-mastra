// Menjalankan pekerjaan panjang (workflow) tanpa menahan respons HTTP.
// Server Mastra adalah proses Node yang hidup terus (Railway/VPS/Docker),
// jadi cukup dibiarkan berjalan. Error dicatat, tidak dilempar ke request.
export function runInBackground(task: () => Promise<unknown>) {
  task().catch((err) => {
    console.error("[background] tugas gagal:", err);
  });
}
