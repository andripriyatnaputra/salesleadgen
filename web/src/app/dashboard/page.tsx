"use client";

import { useState } from "react";

type AgentType = "pengadaan" | "civd" | "civd-file" | "pamjaya" | "kai" | "bjb" | "airnav" | "classifier" | "qualifier" | "outreach";

interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  category: "scraping" | "processing";
  icon: string;
}

const AGENTS: AgentConfig[] = [
  {
    id: "pengadaan",
    name: "Pengadaan.com",
    description: "Scrape tender dari tender.pengadaan.com",
    category: "scraping",
    icon: "🌐",
  },
  {
    id: "civd",
    name: "CIVD SKK Migas",
    description: "Scrape tender dari civd.skkmigas.go.id (real-time)",
    category: "scraping",
    icon: "⛽",
  },
  {
    id: "civd-file",
    name: "CIVD Procurement List",
    description: "Import procurement list dari file lokal (1,682 entries)",
    category: "scraping",
    icon: "📁",
  },
  {
    id: "pamjaya",
    name: "PAM Jaya",
    description: "Scrape tender dari eproc.pamjaya.co.id",
    category: "scraping",
    icon: "💧",
  },
  {
    id: "kai",
    name: "KAI RAPID",
    description: "Scrape tender dari rapid.kai.id",
    category: "scraping",
    icon: "🚆",
  },
  {
    id: "bjb",
    name: "Bank BJB",
    description: "Scrape tender dari eproc.bankbjb.co.id (API)",
    category: "scraping",
    icon: "🏦",
  },
  {
    id: "airnav",
    name: "Airnav Indonesia",
    description: "Scrape tender dari eproc.airnavindonesia.co.id",
    category: "scraping",
    icon: "✈️",
  },
  {
    id: "classifier",
    name: "Classifier",
    description: "Klasifikasi relevansi tender dengan Claude AI",
    category: "processing",
    icon: "🤖",
  },
  {
    id: "qualifier",
    name: "Qualifier",
    description: "Scoring dan prioritas leads berdasarkan ICP",
    category: "processing",
    icon: "📊",
  },
  {
    id: "outreach",
    name: "Outreach",
    description: "Generate email outreach yang dipersonalisasi",
    category: "processing",
    icon: "✉️",
  },
];

export default function DashboardPage() {
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentType>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const toggleAgent = (agentId: AgentType) => {
    const newSet = new Set(selectedAgents);
    if (newSet.has(agentId)) {
      newSet.delete(agentId);
    } else {
      newSet.add(agentId);
    }
    setSelectedAgents(newSet);
  };

  const selectAll = (category: "scraping" | "processing") => {
    const newSet = new Set(selectedAgents);
    AGENTS.filter((a) => a.category === category).forEach((a) => newSet.add(a.id));
    setSelectedAgents(newSet);
  };

  const deselectAll = (category: "scraping" | "processing") => {
    const newSet = new Set(selectedAgents);
    AGENTS.filter((a) => a.category === category).forEach((a) => newSet.delete(a.id));
    setSelectedAgents(newSet);
  };

  const runAgents = async () => {
    if (selectedAgents.size === 0) {
      alert("Pilih minimal 1 agent untuk dijalankan");
      return;
    }

    setRunning(true);
    setProgress([]);

    try {
      const response = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: Array.from(selectedAgents) }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (data.message) {
                setProgress((prev) => [...prev, data.message]);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error running agents:", error);
      setProgress((prev) => [...prev, `❌ Error: ${error}`]);
    } finally {
      setRunning(false);
    }
  };

  const scrapingAgents = AGENTS.filter((a) => a.category === "scraping");
  const processingAgents = AGENTS.filter((a) => a.category === "processing");

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Dashboard</h1>
        <p className="text-gray-600 mt-1">Pilih agent yang ingin dijalankan</p>
      </div>

      {/* Scraping Agents */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Scraping Agents</h2>
          <div className="space-x-2">
            <button
              onClick={() => selectAll("scraping")}
              className="text-xs text-blue-600 hover:underline"
            >
              Pilih Semua
            </button>
            <button
              onClick={() => deselectAll("scraping")}
              className="text-xs text-gray-500 hover:underline"
            >
              Hapus Semua
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scrapingAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              disabled={running}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedAgents.has(agent.id)
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{agent.icon}</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                  <p className="text-sm text-gray-600 mt-0.5">{agent.description}</p>
                </div>
                {selectedAgents.has(agent.id) && (
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Processing Agents */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Processing Agents</h2>
          <div className="space-x-2">
            <button
              onClick={() => selectAll("processing")}
              className="text-xs text-blue-600 hover:underline"
            >
              Pilih Semua
            </button>
            <button
              onClick={() => deselectAll("processing")}
              className="text-xs text-gray-500 hover:underline"
            >
              Hapus Semua
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {processingAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              disabled={running}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedAgents.has(agent.id)
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } ${running ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{agent.icon}</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-sm">{agent.name}</h3>
                  <p className="text-xs text-gray-600 mt-0.5">{agent.description}</p>
                </div>
                {selectedAgents.has(agent.id) && (
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={runAgents}
          disabled={running || selectedAgents.size === 0}
          className={`px-6 py-3 rounded-lg font-semibold transition-all ${
            running || selectedAgents.size === 0
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {running ? "Sedang Berjalan..." : `Jalankan Agent (${selectedAgents.size})`}
        </button>
        {selectedAgents.size > 0 && !running && (
          <span className="text-sm text-gray-600">
            {selectedAgents.size} agent dipilih
          </span>
        )}
      </div>

      {/* Progress Log */}
      {progress.length > 0 && (
        <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
          <h3 className="text-white font-semibold mb-2">Progress Log:</h3>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {progress.map((msg, i) => (
              <div key={i} className="text-xs">
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
