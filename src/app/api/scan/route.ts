import { NextRequest, NextResponse } from "next/server";
import { classifyEmails, checkOllamaHealth } from "@/lib/ollama";
import type { Email } from "@/data/emails1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emails: Email[] = body.emails;
    const model: string = body.model || "mistral";

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "No emails provided" },
        { status: 400 }
      );
    }

    // Check if Ollama is available
    const health = await checkOllamaHealth();
    if (!health.available) {
      return NextResponse.json(
        {
          error: "Ollama is not running. Please start Ollama on your local machine.",
          ollamaAvailable: false,
        },
        { status: 503 }
      );
    }

    // Check if the requested model is available, fall back to first available
    let selectedModel = model;
    if (!health.models.some((m) => m.startsWith(model))) {
      if (health.models.length > 0) {
        selectedModel = health.models[0];
      } else {
        return NextResponse.json(
          {
            error: `No models available. Run: ollama pull mistral`,
            ollamaAvailable: true,
            availableModels: [],
          },
          { status: 404 }
        );
      }
    }

    const results = await classifyEmails(emails, selectedModel);

    return NextResponse.json({
      results,
      model: selectedModel,
      totalProcessed: results.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Scan API error:", message);
    return NextResponse.json(
      { error: `Failed to classify emails: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  const health = await checkOllamaHealth();
  return NextResponse.json(health);
}
