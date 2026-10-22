import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/analyze-feedback/index.ts"), "utf8")
  .replace(/^import .*;\r?\n/gm, "");
const handlerSource = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function submit(comment: string, inference: Response, secrets: Record<string, string> = {}) {
  let handler!: (request: Request) => Promise<Response>;
  let saved: Record<string, unknown> | undefined;
  const fetch = vi.fn().mockResolvedValue(inference);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: "student" }, error: null }) }) }) }),
    rpc: async (_name: string, args: Record<string, unknown>) => { saved = args; return { data: "feedback", error: null }; },
  };
  new Function("Deno", "createClient", "fetch", "console", handlerSource)(
    { env: { get: (name: string) => ({ CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AI_TOKEN: "private-token", ...secrets })[name] ?? "key" }, serve: (fn: typeof handler) => { handler = fn; } },
    () => client,
    fetch,
    { warn: vi.fn(), error: vi.fn() },
  );
  const request = new Request("https://example.test/analyze-feedback", {
    method: "POST",
    headers: { Authorization: "Bearer student", "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: "task", comment, ratings: [] }),
  });
  return { run: async () => { await handler(request); return saved; }, fetch };
}

const inference = (label: string) => Response.json({ success: true, result: { choices: [{ message: { content: label } }] } });

describe("feedback sentiment", () => {
  it("classifies English, Tagalog, and Taglish remarks with the same multilingual model", async () => {
    for (const [comment, label] of [
      ["Organizers didnt handle the event smoothly", "negative"],
      ["Hindi maayos ang programa", "negative"],
      ["Ang ganda ng seminar, helpful yung tips", "positive"],
      ["The seminar was held on Tuesday", "neutral"],
    ]) {
      const submission = submit(comment, inference(label));
      expect(await submission.run()).toMatchObject({ p_sentiment_label: label, p_sentiment_score: null });
      const [url, options] = submission.fetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai/run/@cf/zai-org/glm-4.7-flash`);
      expect(options.headers).toMatchObject({ Authorization: "Bearer private-token" });
      expect(JSON.parse(String(options.body))).toMatchObject({
        messages: [{ role: "system" }, { role: "user", content: comment }],
        chat_template_kwargs: { enable_thinking: false },
      });
    }
  });

  it("accepts the simple response format and rejects prose or failed inference", async () => {
    expect(await submit("Helpful event", Response.json({ success: true, result: { response: "positive\n" } })).run())
      .toMatchObject({ p_sentiment_label: "positive", p_sentiment_score: null });
    expect(await submit("Helpful event", inference("probably positive")).run())
      .toMatchObject({ p_sentiment_label: null, p_sentiment_score: null });
    expect(await submit("Helpful event", Response.json({ success: false, result: { response: "positive" } })).run())
      .toMatchObject({ p_sentiment_label: null, p_sentiment_score: null });
    expect(await submit("Helpful event", new Response("unavailable", { status: 503 })).run())
      .toMatchObject({ p_sentiment_label: null, p_sentiment_score: null });
  });

  it("does not call a provider with an invalid account ID", async () => {
    const submission = submit("Hindi maayos ang programa", inference("positive"), { CLOUDFLARE_ACCOUNT_ID: "invalid/account" });
    expect(await submission.run()).toMatchObject({ p_sentiment_label: null, p_sentiment_score: null });
    expect(submission.fetch).not.toHaveBeenCalled();
  });
});
