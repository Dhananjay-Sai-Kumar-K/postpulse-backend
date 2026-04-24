// backend/src/services/openaiCompatibleService.ts

/**
 * Generic service to call any API that is compatible with the OpenAI format.
 * This works for OpenRouter, RelayFreeLLM, FreeLLMAPI, Together AI, etc.
 */
export async function generatePostWithOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Optional headers recommended for OpenRouter specifically
      "HTTP-Referer": "https://postpulse.app", 
      "X-Title": "PostPulse",
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "";
}
