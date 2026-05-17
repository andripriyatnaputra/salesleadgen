import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { join } from "path";

type AgentType = "pengadaan" | "civd" | "civd-file" | "pamjaya" | "kai" | "bjb" | "airnav" | "classifier" | "qualifier" | "outreach";

export async function POST(request: NextRequest) {
  const { agents } = await request.json() as { agents: AgentType[] };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendMessage = (message: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ message })}\n\n`));
      };

      try {
        sendMessage("🚀 Memulai pipeline...");

        // Path ke project root (dari web ke parent)
        const projectRoot = join(process.cwd(), "..");
        const scriptPath = join(projectRoot, "src", "agents-runner.ts");

        // Jalankan agent runner dengan tsx untuk execute TypeScript langsung
        const child = spawn("npx", ["tsx", scriptPath, ...agents], {
          cwd: projectRoot,
          env: { ...process.env },
        });

        child.stdout.on("data", (data) => {
          const output = data.toString();
          const lines = output.split("\n").filter((line: string) => line.trim());
          lines.forEach((line: string) => sendMessage(line));
        });

        child.stderr.on("data", (data) => {
          sendMessage(`⚠️ ${data.toString()}`);
        });

        child.on("close", (code) => {
          if (code === 0) {
            sendMessage("✅ Pipeline selesai!");
          } else {
            sendMessage(`❌ Pipeline gagal dengan kode: ${code}`);
          }
          controller.close();
        });

        child.on("error", (error) => {
          sendMessage(`❌ Error: ${error.message}`);
          controller.close();
        });

      } catch (error) {
        sendMessage(`❌ Error: ${error}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
