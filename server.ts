import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const PORT = 3000;

// Initialize Gemini SDK with custom telemetry header as instructed
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API router / endpoints
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", geminiConfigured: !!ai });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, deviceConfig } = req.body;
      if (!message) {
         res.status(400).json({ error: "Faltó el mensaje del usuario" });
         return;
      }

      if (!ai) {
         res.status(503).json({ 
          response: "El servidor aún no tiene configurada la clave GEMINI_API_KEY. Ve a Ajustes > Secrets para configurarla, o puedes usar los códigos de ejemplo interactivos." 
        });
        return;
      }

      // Compile rich system instructions centered around helping users compile a RAM cleaner accessibility app on budget 2GB Android devices
      const systemInstruction = `Eres un Ingeniero Experto de Android especializado en optimización de rendimiento, recolección de basura (GC), memoria RAM y el funcionamiento del Servicio de Accesibilidad (AccessibilityService) en Kotlin.

El usuario te está haciendo consultas desde un "Simulador RAM Cleaner & Code Lab".
Configuración actual del dispositivo del usuario:
- Versión de Android configurada: ${deviceConfig?.androidVersion || "Android 10 - 14+"}
- Nivel de experiencia del usuario: ${deviceConfig?.experienceLevel || "Principiante"}
- RAM Física: 2GB (Dispositivo de recursos limitados, muy propenso a OOM y cierres de procesos).

REGLAS DE RESPUESTA:
1. Responde de manera sumamente clara, profesional, educativa y concisa, en ESPAÑOL.
2. Explica la verdad técnica de fondo: cómo Android administra la memoria mediante LMK (Low Memory Killer) y por qué los métodos que solo cierran apps en segundo plano desde el código básico con killBackgroundProcesses() son inútiles (se reinician de inmediato, consumiendo más batería y CPU).
3. Da consejos de código reales, prácticos, listos para Android Studio en Kotlin. Si te piden código, muéstralo de forma limpia con comentarios útiles.
4. Ayuda al usuario a entender cómo compilar su APK con Android Studio, habilitar la depuración USB y los permisos de accesibilidad en su teléfono real de 2GB de RAM de forma segura y sin Root.
5. Usa terminología adecuada de Android (por ejemplo: AccessibilityNodeInfo, ApplicationInfo, PackageQuery, LMK, Garbage Collector) pero explícala con analogías sencillas si el nivel del usuario es principiante.`;

      // Build chat object or content request
      // We will map history to appropriate GenAI content format
      const formattedContents: any = [];
      
      if (history && Array.isArray(history)) {
        for (const turn of history) {
          formattedContents.push({
            role: turn.role === "assistant" ? "model" : "user",
            parts: [{ text: turn.content }]
          });
        }
      }
      
      // Append current message
      formattedContents.push({
        role: "user",
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ response: response.text });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: "Disculpa, hubo un problema al procesar tu solicitud con la IA.", details: error.message });
    }
  });

  // Serve static application bundle
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running at http://localhost:${PORT} (Production: ${isProd})`);
  });
}

startServer();
