import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { generatePostWithGroq } from "./groqService";
import { generatePostWithOpenAICompatible } from "./openaiCompatibleService";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!config.geminiApiKey || config.geminiApiKey === "your_gemini_api_key_here") {
      throw new Error(
        "GEMINI_API_KEY not configured. Get one at https://aistudio.google.com/apikey"
      );
    }
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

export interface GeneratedPost {
  text: string;
  characterCount: number;
  suggestedHashtags: string[];
  platform: "twitter" | "linkedin";
  tone: string;
  imageUrl: string | null;
}

/**
 * Generate an SEO-optimized social media post for a given news article.
 */
export async function generatePost(params: {
  title: string;
  summary: string;
  source: string;
  link: string;
  imageUrl?: string | null;
  platform?: "twitter" | "linkedin";
  tone?: string;
}): Promise<GeneratedPost> {
  const platform = params.platform || "twitter";
  const toneName = params.tone || "professional";
  const toneInstruction = config.tones[toneName] || config.tones.professional;

  const charLimit = platform === "twitter" ? 270 : 2800; // Leave room for hashtags on X
  const platformName = platform === "twitter" ? "X (Twitter)" : "LinkedIn";

  const prompt = `You are an expert social media content creator specializing in AI, Machine Learning, and technology news.

TASK: Create an engaging, SEO-optimized social media post for ${platformName}.

NEWS ARTICLE:
Title: ${params.title}
Summary: ${params.summary}
Source: ${params.source}
Link: ${params.link}

INSTRUCTIONS:
- ${toneInstruction}
- Maximum ${charLimit} characters for the post text (NOT counting hashtags).
- Include the article link naturally in the post.
- Make it attention-grabbing — the first line should hook the reader.
- For ${platformName}, optimize for engagement (${platform === "twitter" ? "retweets and likes" : "comments and shares"}).
- DO NOT use markdown formatting. Plain text only.
${platform === "linkedin" ? "- For LinkedIn, you can use line breaks for readability. Include a compelling opening hook and a call-to-action." : "- For X, be concise and punchy. Every word matters."}

RESPOND IN EXACTLY THIS JSON FORMAT (no markdown, no code blocks):
{
  "text": "Your generated post text here",
  "suggestedHashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}

Generate 5 relevant, trending hashtags related to the article topic. Do NOT include the # symbol in the hashtags array.`;

  // Router config: list of models to try in order
  const providers = [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "gemini", model: "gemini-1.5-flash-latest" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "groq", model: "mixtral-8x7b-32768" },
    // OpenRouter integration
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
    // FreeLLMAPI integration
    { provider: "freellmapi", model: "gpt-3.5-turbo", baseUrl: process.env.FREELLMAPI_BASE_URL || "https://api.freellmapi.com/v1", envKey: "FREELLMAPI_API_KEY" },
    // RelayFreeLLM integration (Self-hosted or proxy URL)
    { provider: "relayfreellm", model: "llama-3", baseUrl: process.env.RELAYFREELLM_BASE_URL || "http://localhost:8080/v1", envKey: "RELAYFREELLM_API_KEY" }
  ];

  let responseText = "";
  let lastError: Error | null = null;

  // Multi-provider router logic
  for (const p of providers) {
    try {
      console.log(`[AIService] Routing request to ${p.provider} (${p.model})...`);
      
      if (p.provider === "gemini") {
        const client = getClient();
        const model = client.getGenerativeModel({
          model: p.model as string,
          generationConfig: { temperature: 0.8, topP: 0.9, maxOutputTokens: 1024 },
        });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        break; // Success! Exit the retry loop
      } 
      else if (p.provider === "groq") {
        if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
        responseText = await generatePostWithGroq(prompt, p.model as string);
        break; // Success! Exit the retry loop
      }
      else if (["openrouter", "freellmapi", "relayfreellm"].includes(p.provider)) {
        const apiKey = process.env[p.envKey as string];
        if (!apiKey) throw new Error(`${p.envKey} not configured`);
        
        responseText = await generatePostWithOpenAICompatible(
          p.baseUrl as string,
          apiKey,
          p.model as string,
          prompt
        );
        break; // Success!
      }
    } catch (error: any) {
      console.warn(`[AIService] ⚠️ ${p.provider} (${p.model}) failed: ${error.message}`);
      lastError = error;
      // Continues to the next provider in the array...
    }
  }

  if (!responseText) {
    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  // Parse the JSON response
  let parsed: { text: string; suggestedHashtags: string[] };
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error("[AIService] Failed to parse Gemini response:", responseText);
    // Fallback: use the raw text
    parsed = {
      text: responseText.substring(0, charLimit),
      suggestedHashtags: ["AI", "MachineLearning", "Tech", "Innovation", "FutureTech"],
    };
  }

  // Ensure hashtags don't have # prefix
  const hashtags = parsed.suggestedHashtags.map((tag) => tag.replace(/^#/, ""));

  return {
    text: parsed.text,
    characterCount: parsed.text.length,
    suggestedHashtags: hashtags,
    platform,
    tone: toneName,
    imageUrl: params.imageUrl || null,
  };
}

/**
 * Regenerate a post with a different tone.
 * Just calls generatePost with the new tone parameter.
 */
export async function regeneratePost(params: {
  title: string;
  summary: string;
  source: string;
  link: string;
  imageUrl?: string | null;
  platform?: "twitter" | "linkedin";
  tone: string;
}): Promise<GeneratedPost> {
  return generatePost(params);
}
