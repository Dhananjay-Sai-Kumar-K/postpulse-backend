// backend/src/services/groqService.ts
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function generatePostWithGroq(prompt: string, model: string = "llama-3.3-70b-versatile"): Promise<string> {
    const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: model,
    });
    return chatCompletion.choices[0]?.message?.content || "";
}