import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Fetch dish image automatically from Google using Gemini Search Grounding
  app.get("/api/fetch-dish-image", async (req, res) => {
    const queryName = req.query.name as string;
    if (!queryName) {
      return res.status(400).json({ error: "Name query parameter is required" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("GEMINI_API_KEY is not defined. Falling back to dynamic placeholder.");
        const seedStr = encodeURIComponent(queryName);
        return res.json({ imageUrl: `https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=400&sig=${seedStr}` });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Find a high-quality, direct public image URL representing the food dish: "${queryName}".
Search Google for "unsplash ${queryName}" or "wikipedia ${queryName} food" or other open/free food image websites.
The URL must be a direct link starting with http/https.
Respond with ONLY the raw image URL. Do not include markdown code blocks, do not include any explanatory text or formatting. Only the raw URL.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a precise image URL locator. You respond ONLY with a single direct image URL. No extra text, no markdown backticks.",
          tools: [{ googleSearch: {} }]
        }
      });

      let returnedText = response.text || "";
      returnedText = returnedText.trim();
      
      // Clean-up response text in case markdown formatting was generated
      if (returnedText.includes("```")) {
        const match = returnedText.match(/https?:\/\/[^\s`"]+/);
        if (match) {
          returnedText = match[0];
        }
      }

      // Validate URL format
      if (/^https?:\/\//i.test(returnedText)) {
        return res.json({ imageUrl: returnedText });
      } else {
        const urlRegex = /(https?:\/\/[^\s'"]+)/g;
        const foundUrls = returnedText.match(urlRegex);
        if (foundUrls && foundUrls.length > 0) {
          return res.json({ imageUrl: foundUrls[0] });
        }
      }

      const seedStr = encodeURIComponent(queryName);
      return res.json({ imageUrl: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400&sig=${seedStr}` });

    } catch (error: any) {
      console.error("Error in fetch-dish-image API:", error);
      const seedStr = encodeURIComponent(queryName);
      return res.json({ imageUrl: `https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=400&sig=${seedStr}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
