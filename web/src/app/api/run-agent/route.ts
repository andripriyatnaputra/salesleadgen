import { NextRequest } from "next/server";

type AgentType = "pengadaan" | "civd" | "civd-file" | "pamjaya" | "kai" | "bjb" | "airnav" | "classifier" | "qualifier" | "outreach";

export async function POST(request: NextRequest) {
  const { agents } = await request.json() as { agents: AgentType[] };

  // Backend API URL (in production: backend container, in dev: localhost)
  const backendUrl = process.env.BACKEND_URL || "http://backend:3001";

  try {
    // Call backend API to run agents
    const response = await fetch(`${backendUrl}/api/run-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ agents }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to start agents" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream the response from backend
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error("Error calling backend:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to backend" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
