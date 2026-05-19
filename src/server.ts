import express from "express";
import { spawn } from "child_process";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "starcom-leadgen-backend" });
});

// Run agents endpoint
app.post("/api/run-agent", (req, res) => {
  const { agents } = req.body as { agents: string[] };

  if (!agents || !Array.isArray(agents) || agents.length === 0) {
    return res.status(400).json({ error: "Invalid agents parameter" });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendMessage = (message: string) => {
    res.write(`data: ${JSON.stringify({ message })}\n\n`);
  };

  try {
    sendMessage("🚀 Memulai pipeline...");

    // Run agents-runner.ts with selected agents
    const child = spawn("npx", ["tsx", "src/agents-runner.ts", ...agents], {
      cwd: "/app",
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
      res.end();
    });

    child.on("error", (error) => {
      sendMessage(`❌ Error: ${error.message}`);
      res.end();
    });
  } catch (error) {
    sendMessage(`❌ Error: ${error}`);
    res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
