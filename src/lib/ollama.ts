import type { Email } from "@/data/emails1";

const OLLAMA_BASE_URL = "http://localhost:11434";

const SYSTEM_PROMPT = `You are an email-cleanup assistant focused on reducing digital waste and energy consumption.
Your job is to decide whether an email should be deleted, kept, or reviewed.

Rules:
- Delete obvious promotions, spam, newsletters, and unread bulk emails
- Keep personal, school, work, financial, legal, and account-related emails
- Use REVIEW if unsure
- Be conservative: when in doubt, choose REVIEW
- Output valid JSON only

You must respond with ONLY a JSON object in this exact format, no markdown, no explanation:
{"decision":"DELETE","confidence":0.92,"reason":"Promotional email with no personal or financial relevance."}

decision must be one of: "DELETE", "KEEP", "REVIEW"
confidence must be a number between 0 and 1
reason must be a single sentence

You will receive:
- Sender name and email address
- Subject line
- Date sent
- Whether the email was read
- Email labels (Spam, Promotions, Primary, etc.)
- Whether it has attachments
- Body
`;

export interface LLMClassification {
  decision: "DELETE" | "KEEP" | "REVIEW";
  confidence: number;
  reason: string;
}

export interface ClassifiedEmail {
  emailId: string;
  classification: LLMClassification;
}

function buildEmailPrompt(email: Email): string {
  return JSON.stringify({
    id: email.id,
    from: email.from,
    subject: email.subject,
    body: email.body,
    labels: email.labels,
    date: email.date,
    has_attachment: email.has_attachment,
    read: email.read,
  });
}

async function classifySingleEmail(
  email: Email,
  model: string
): Promise<LLMClassification> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Classify this email:\n${buildEmailPrompt(email)}` },
      ],
      stream: false,
      format: {
        type: "object",
        properties: {
          decision: { type: "string", enum: ["DELETE", "KEEP", "REVIEW"] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["decision", "confidence", "reason"],
      },
      options: {
        temperature: 0.1,
        num_predict: 150,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Ollama API error: ${response.status} ${errText}`);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid JSON from Ollama: ${responseText.slice(0, 200)}`);
  }
  if (data.error) {
    throw new Error(`Ollama error: ${data.error}`);
  }
  const text: string = data.message?.content?.trim() ?? "";

  return parseClassification(text);
}

function parseClassification(text: string): LLMClassification {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { decision: "REVIEW", confidence: 0.5, reason: "Could not parse LLM response." };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const decision = (parsed.decision ?? "REVIEW").toUpperCase();
    if (!["DELETE", "KEEP", "REVIEW"].includes(decision)) {
      return { decision: "REVIEW", confidence: 0.5, reason: "Invalid decision from LLM." };
    }
    return {
      decision: decision as "DELETE" | "KEEP" | "REVIEW",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      reason: String(parsed.reason || "No reason provided.").slice(0, 200),
    };
  } catch {
    return { decision: "REVIEW", confidence: 0.5, reason: "Could not parse LLM response." };
  }
}

export async function classifyEmails(
  emails: Email[],
  model: string = "mistral"
): Promise<ClassifiedEmail[]> {
  // Process in batches of 5 concurrently
  const BATCH_SIZE = 5;
  const results: ClassifiedEmail[] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        try {
          const classification = await classifySingleEmail(email, model);
          return { emailId: email.id, classification };
        } catch {
          return {
            emailId: email.id,
            classification: {
              decision: "REVIEW" as const,
              confidence: 0.5,
              reason: "LLM classification failed - marked for manual review.",
            },
          };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

export async function checkOllamaHealth(): Promise<{
  available: boolean;
  models: string[];
}> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { available: false, models: [] };
    const data = await response.json();
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}
