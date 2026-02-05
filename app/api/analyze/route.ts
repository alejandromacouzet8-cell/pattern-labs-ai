import { NextResponse } from "next/server";
import OpenAI from "openai";

/* =======================
   Tipos
======================= */

/* =======================
   Unified Schema - Demo & Paid use same structure
======================= */

type PatternItem = {
  title: string;
  description: string;
  category: "Emoción" | "Dinámica" | "Fortaleza" | "Riesgo";
  evidence?: string; // PAID ONLY: short quote
};

type PatternScore = {
  value: number; // 0-10
  label: string; // "Balance emocional"
  interpretation: string; // 1-2 sentences
};

type EvidenceItem = {
  pattern: string;
  quote: string;
  context: string;
};

type AnalyzeResult = {
  ok: boolean;
  version: "demo" | "full";
  fileName: string;
  length: number;

  // Core metric (ALWAYS present)
  patternScore: PatternScore;

  // Main patterns (demo: 3, paid: 8)
  patterns: PatternItem[];

  // Insights (PAID ONLY)
  tlDr?: string[];
  strengths?: string[];
  areasToWatch?: string[]; // renamed from "risks"

  // Evidence quotes (PAID ONLY)
  evidence?: EvidenceItem[];

  // Deep sections (PAID ONLY - legacy support)
  sections?: Array<{
    id: string;
    title: string;
    body: string;
  }>;

  // Legacy fields (for compatibility)
  rawAnalysis?: string;
  fullChat: string;
  truncated?: boolean;
  processedLength?: number;
};

/* =======================
   OpenAI Client
======================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =======================
   Prompt (ANTI-GENÉRICO)
======================= */

const SYSTEM_PROMPT = `
Eres un analista forense de conversaciones de WhatsApp.

PROHIBIDO:
- Generalizar o usar frases vagas ("buena base", "hay cariño", "la relación tiene potencial")
- Diagnosticar clínicamente ("es narcisista", "tiene depresión")
- Usar lenguaje alarmista ("red flags", "tóxico", "manipulación")

OBLIGATORIO:
- Basar CADA afirmación en evidencia directa del chat
- Usar tono neutro, empático y no-judgmental
- Citar fragmentos EXACTOS del chat (máximo 60 caracteres)

Devuelve EXCLUSIVAMENTE este JSON válido:

{
  "patternScore": {
    "value": number (0-10),
    "label": "Balance emocional",
    "interpretation": "1-2 frases explicando el score en lenguaje humano, sin tecnicismos"
  },
  "patterns": [
    {
      "title": "Título claro y específico del patrón",
      "description": "1-2 frases explicando qué significa este patrón y por qué importa",
      "category": "Emoción" | "Dinámica" | "Fortaleza" | "Riesgo",
      "evidence": "Cita corta del chat (SOLO EN MODO FULL)"
    }
  ],
  "tlDr": ["Insight clave 1", "Insight clave 2"],
  "strengths": ["Fortaleza específica con evidencia"],
  "areasToWatch": ["Área que necesita atención (sin alarmismo)"],
  "evidence": [
    {
      "pattern": "A qué patrón corresponde",
      "quote": "Cita exacta del chat (max 60 chars)",
      "context": "Por qué esta cita es relevante"
    }
  ]
}

REGLAS PARA PATRONES:
- MODO DEMO: Devolver EXACTAMENTE 3 patrones (1 Emoción, 1 Dinámica, 1 Fortaleza)
- MODO FULL: Devolver EXACTAMENTE 8 patrones diversos (2 Emoción, 2 Dinámica, 2 Fortaleza, 2 Riesgo) + campo "evidence" en cada patrón
- Cada patrón debe:
  • Ser específico a ESTE chat
  • Evitar generalizaciones
  • Ser accionable
  • Usar lenguaje neutral

EJEMPLOS DE BUENOS TÍTULOS:
- "Picos de ansiedad en horarios nocturnos"
- "Desbalance en quién inicia las conversaciones"
- "Ciclos de reconciliación tras conflictos"
- "Evolución positiva en los últimos 2 meses"

EVITAR:
- "Buena comunicación" (muy genérico)
- "Problemas de confianza" (demasiado interpretativo)
- "Codependencia emocional" (diagnóstico clínico)
`;

/* =======================
   Handler
======================= */

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = (formData.get("mode") as string) || "free"; // "free" or "full"

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo .txt." },
        { status: 400 }
      );
    }

    const text = await file.text();
    const fileName = (file as any).name ?? "chat.txt";
    const length = text.length;
    const isFullMode = mode === "full";

    if (!text.trim()) {
      return NextResponse.json(
        { error: "El archivo está vacío." },
        { status: 400 }
      );
    }

    // 🔎 DEBUG REAL
    console.log("📄 FILE:", fileName);
    console.log("📏 LENGTH:", length);
    console.log("🎯 MODE:", isFullMode ? "FULL" : "DEMO");
    console.log("👀 PREVIEW:", text.slice(0, 300));

    // ✂️ LÍMITES DIFERENTES SEGÚN MODO:
    // WhatsApp chats tienen ratio ~1:1 caracteres:tokens por emojis y formato
    // GPT-4o-mini = 128k tokens, reservamos ~8k para prompt del sistema
    // - DEMO: 80,000 caracteres (~80k tokens, seguro)
    // - FULL (Pagado): 100,000 caracteres (~100k tokens, con margen)
    const MAX_CHARS_DEMO = 80000;
    const MAX_CHARS_FULL = 100000;
    const MAX_CHARS = isFullMode ? MAX_CHARS_FULL : MAX_CHARS_DEMO;

    let processedText = text;
    let wasTruncated = false;

    if (text.length > MAX_CHARS) {
      wasTruncated = true;
      // Tomar los últimos N caracteres (lo más reciente del chat)
      processedText = text.slice(-MAX_CHARS);
      console.log(`⚠️ Chat truncado de ${length} a ${MAX_CHARS} caracteres (tomando mensajes más recientes)`);
    }

    /* =======================
       LLAMADA CORRECTA A OPENAI
       (ESTE ERA EL BUG)
    ======================= */

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
MODO: ${isFullMode ? "FULL (devuelve EXACTAMENTE 8 patrones con evidencia: 2 Emoción, 2 Dinámica, 2 Fortaleza, 2 Riesgo)" : "DEMO (devuelve EXACTAMENTE 3 patrones: 1 Emoción, 1 Dinámica, 1 Fortaleza)"}

Este es un chat exportado de WhatsApp${wasTruncated ? ' (mensajes más recientes debido al tamaño)' : ''}.

Reglas:
- Cada línea es un mensaje
- El nombre antes de ":" indica quién habla
- El orden es cronológico
- NO infieras más allá del texto
${wasTruncated ? '- Este chat fue truncado automáticamente, analiza solo lo que se ve aquí' : ''}
- ${isFullMode ? 'Incluye el campo "evidence" en cada patrón con una cita corta' : 'NO incluyas el campo "evidence" en los patrones'}

CHAT:
${processedText}
`,
        },
      ],
    });

    const aiText =
      completion.choices[0]?.message?.content?.trim() ?? "";

    console.log("🧠 AI RAW OUTPUT:", aiText);

    /* =======================
       PARSEO ESTRICTO
    ======================= */

    let parsed: any;

    try {
      parsed = JSON.parse(aiText);
    } catch (err) {
      console.error("❌ JSON inválido devuelto por IA:", aiText);
      return NextResponse.json(
        {
          error:
            "La IA devolvió una respuesta inválida. Intenta nuevamente o sube otro chat.",
        },
        { status: 500 }
      );
    }

    /* =======================
       RESULTADO FINAL - Unified Schema
    ======================= */

    const result: AnalyzeResult = {
      ok: true,
      version: isFullMode ? "full" : "demo",
      fileName,
      length, // longitud original del archivo

      // Core metric (ALWAYS present)
      patternScore: {
        value: typeof parsed.patternScore?.value === "number" ? parsed.patternScore.value : 7.5,
        label: parsed.patternScore?.label || "Balance emocional",
        interpretation: parsed.patternScore?.interpretation || "Se observa un balance general en la comunicación.",
      },

      // Main patterns (demo: 3, paid: 6-8)
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],

      // Paid-only insights
      tlDr: isFullMode && Array.isArray(parsed.tlDr) ? parsed.tlDr : undefined,
      strengths: isFullMode && Array.isArray(parsed.strengths) ? parsed.strengths : undefined,
      areasToWatch: isFullMode && Array.isArray(parsed.areasToWatch) ? parsed.areasToWatch : undefined,

      // Paid-only evidence
      evidence: isFullMode && Array.isArray(parsed.evidence) ? parsed.evidence : undefined,

      // Legacy support
      sections: isFullMode && Array.isArray(parsed.sections) ? parsed.sections : undefined,
      rawAnalysis: JSON.stringify(parsed),
      fullChat: processedText,
      truncated: wasTruncated,
      processedLength: processedText.length,
    };

    // Mensaje informativo si fue truncado
    if (wasTruncated) {
      console.log(`ℹ️ Chat original: ${length} chars → Procesado: ${processedText.length} chars`);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("❌ Error en /api/analyze:", err);
    return NextResponse.json(
      {
        error:
          err?.message ??
          "Ocurrió un error inesperado al generar el reporte.",
      },
      { status: 500 }
    );
  }
}