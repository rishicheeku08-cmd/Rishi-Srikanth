import express from "express";
import type { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured in the environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "utsav-ai" });
  });

  // Generate AI Celebration Blueprint
  app.post("/api/ai/blueprint", async (req: Request, res: Response) => {
    try {
      const {
        eventType,
        coupleNames,
        city,
        guestCount,
        days,
        totalBudget,
        currency,
        aesthetic,
        traditions,
      } = req.body ?? {};

      if (!coupleNames || !city) {
        res.status(400).json({ error: "Please provide host/couple names and a destination city." });
        return;
      }

      const ai = getGeminiClient();

      const prompt = `Create a comprehensive, realistic, and culturally nuanced event and wedding planning blueprint for:
- Event Type: ${eventType || "Multi-Day Wedding"}
- Hosts / Couple: ${coupleNames}
- Destination / Venue Setting: ${city}
- Estimated Guests: ${guestCount || 150}
- Duration: ${days || 3} days
- Total Budget: ${currency === "USD" ? "$" : "₹"}${totalBudget || 2500000} (${currency || "INR"})
- Aesthetic & Design Direction: ${aesthetic || "Heritage Sandstone & Marigold"}
- Traditions & Special Notes: ${traditions || "Blend of heritage rituals and modern hospitality"}

Generate:
1. A refined design concept summary (venue atmosphere, color palette, floral direction, culinary mood).
2. A day-by-day ceremony & event schedule across ${days || 3} days (4 to 8 meaningful events total) with realistic time windows, venue zone names, dress code / floral notes, and status "Planned".
3. An itemized budget breakdown whose estimated amounts sum closely to ${totalBudget || 2500000} across categories: Venue & Stay, Catering & Bar, Decor & Florals, Attire & Jewellery, Photography, Entertainment, Logistics.
4. A prioritized vendor & planning checklist (6 to 8 actionable items) tailored to ${city} and ${eventType}.
5. 3 concise hospitality & guest experience recommendations.`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          systemInstruction:
            "You are Utsav AI, an experienced luxury wedding and milestone event architect specializing in Indian, South Asian, and global destination celebrations. Provide grounded, practical, tasteful, and budget-realistic recommendations.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              conceptTitle: { type: Type.STRING },
              conceptSummary: { type: Type.STRING },
              colorPalette: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              floralDirection: { type: Type.STRING },
              culinaryDirection: { type: Type.STRING },
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.INTEGER },
                    timeWindow: { type: Type.STRING },
                    title: { type: Type.STRING },
                    zone: { type: Type.STRING },
                    dressCode: { type: Type.STRING },
                    notes: { type: Type.STRING },
                  },
                },
              },
              budgetItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    estimated: { type: Type.NUMBER },
                    notes: { type: Type.STRING },
                  },
                },
              },
              checklist: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    task: { type: Type.STRING },
                    category: { type: Type.STRING },
                    timeline: { type: Type.STRING },
                  },
                },
              },
              hospitalityTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText);
      res.json({ blueprint: parsed });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to generate celebration blueprint.";
      console.error("Blueprint AI error:", error);
      res.status(500).json({ error: message });
    }
  });

  // Interactive AI Concierge endpoint
  app.post("/api/ai/concierge", async (req: Request, res: Response) => {
    try {
      const { message, history, context } = req.body ?? {};
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "A prompt message is required." });
        return;
      }

      const ai = getGeminiClient();

      const contextSummary = context
        ? `Active Celebration Context:
- Couple / Hosts: ${context.coupleNames || "Not specified"}
- Event Type: ${context.eventType || "Wedding"}
- City: ${context.city || "Not specified"}
- Guests: ${context.guestCount || "Not specified"}
- Currency: ${context.currency || "INR"}
- Total Budget: ${context.totalBudget || "Not specified"}
- Scheduled Ceremonies: ${(context.scheduleTitles || []).join(", ") || "None yet"}`
        : "";

      const conversationHistory = Array.isArray(history)
        ? history
            .slice(-8)
            .map((m: { role?: string; text?: string }) => `${m.role === "user" ? "User" : "Utsav AI"}: ${m.text || ""}`)
            .join("\n")
        : "";

      const fullPrompt = `${contextSummary}

${conversationHistory ? `Recent Conversation:\n${conversationHistory}\n` : ""}
User Request: ${message}`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: fullPrompt,
        config: {
          systemInstruction:
            "You are Utsav AI Concierge, a warm, articulate, and practical wedding and event planning advisor. Keep responses structured, concise, actionable, and tailored to the user's celebration context. Use clean plain text with bullet points when helpful—avoid unnecessary filler.",
        },
      });

      res.json({ reply: response.text ?? "I could not generate a response right now. Please try again." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to reach Utsav AI Concierge.";
      console.error("Concierge AI error:", error);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Utsav AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
