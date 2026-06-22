// History compression for long chats. Provider-agnostic: it reuses the user's
// configured provider/model through the same registry the main stream uses, so
// it works for OpenAI, Google, and custom gateways — not just Anthropic.

import { generateText } from "ai";
import { buildRuntime } from "./registry";
import type { ProviderId } from "./provider";

interface SummaryParams {
  providerId: ProviderId;
  apiKey: string;
  baseUrl?: string;
  model: string;
  oldTurns: { role: "user" | "assistant"; content: string }[];
  existingSummary?: string | null;
}

const MAX_SUMMARY_TOKENS = 512;

export async function summarizeHistory({
  providerId,
  apiKey,
  baseUrl,
  model,
  oldTurns,
  existingSummary,
}: SummaryParams): Promise<string> {
  const { model: languageModel } = buildRuntime(providerId, {
    apiKey,
    baseUrl,
    model,
    webSearch: false,
  });

  const prior = existingSummary ? `Previous summary:\n${existingSummary}\n\n` : "";
  const turns = oldTurns
    .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
    .join("\n\n");

  const { text } = await generateText({
    model: languageModel,
    maxOutputTokens: MAX_SUMMARY_TOKENS,
    prompt:
      `${prior}Summarize the following conversation turns into 2-4 concise paragraphs. ` +
      `Preserve key questions, passages discussed, and conclusions. ` +
      `Write in third-person ("the user asked…", "the AI explained…").\n\n` +
      turns,
  });

  return text;
}
