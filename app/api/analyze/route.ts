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

type ChatType = {
  type: "1-on-1" | "group";
  participants: string[];
  relationshipType: "romántica" | "amistad" | "familia" | "trabajo" | "otro";
  chatDuration?: string;
};

type AnalyzeResult = {
  ok: boolean;
  version: "demo" | "full";
  fileName: string;
  length: number;

  // Chat metadata (ALWAYS present)
  chatType?: ChatType;

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
Eres un experto en psicología de relaciones y análisis de comunicación digital de nivel élite.
Tu trabajo es analizar conversaciones de WhatsApp y extraer insights que sorprendan al usuario por su precisión.

## TU MISIÓN
Hacer que el usuario diga "¿Cómo supo eso?" al leer tu análisis. Debes encontrar los detalles que NADIE más notaría.

## PASO 1: DETECTAR TIPO DE CHAT
Primero identifica:
- ¿Es conversación 1-a-1 o grupo?
- ¿Cuántas personas participan? (detecta los nombres únicos)
- ¿Qué tipo de relación es? (romántica, amistad, familia, trabajo, otro)

## PASO 2: ANÁLISIS PROFUNDO
Lee TODO el chat cuidadosamente. Busca:
- Cambios de tono a lo largo del tiempo
- Quién inicia más conversaciones (cuenta)
- Tiempos de respuesta (¿alguien tarda horas? ¿segundos?)
- Uso de emojis y cómo cambia
- Temas que generan mensajes largos vs cortos
- Momentos de vulnerabilidad emocional
- Patrones de horarios (¿hablan de noche? ¿madrugada?)
- Palabras o frases que se repiten
- Conflictos y cómo se resuelven (o no)
- Desequilibrios en la energía de la conversación

## PROHIBIDO
- Generalizar ("buena comunicación", "hay cariño")
- Diagnosticar ("narcisista", "depresión", "ansiedad")
- Alarmar ("tóxico", "red flags", "manipulación")
- Inventar cosas que NO están en el chat

## OBLIGATORIO
- Cada afirmación DEBE tener evidencia del chat
- Sé específico: menciona NOMBRES, FECHAS, FRASES exactas
- Tono empático pero directo
- Citas textuales del chat (máx 60 caracteres)

## FORMATO JSON (devuelve SOLO esto):

{
  "chatType": {
    "type": "1-on-1" | "group",
    "participants": ["Nombre1", "Nombre2"],
    "relationshipType": "romántica" | "amistad" | "familia" | "trabajo" | "otro",
    "chatDuration": "Estimación del período (ej: '3 meses', '2 semanas')"
  },
  "patternScore": {
    "value": number (0-10),
    "label": "Salud de la conexión",
    "interpretation": "2-3 frases que resuman el estado de esta relación de forma memorable y específica"
  },
  "patterns": [
    {
      "title": "Título impactante y específico (debe generar curiosidad)",
      "description": "Descripción que haga que el usuario piense 'wow, es verdad'. Menciona nombres y ejemplos concretos.",
      "category": "Emoción" | "Dinámica" | "Fortaleza" | "Riesgo",
      "evidence": "Cita textual del chat que pruebe este patrón"
    }
  ],
  "tlDr": ["Insight que impacte", "Segundo insight memorable", "Tercer insight accionable"],
  "strengths": ["Fortaleza específica con ejemplo del chat"],
  "areasToWatch": ["Área de oportunidad con sugerencia concreta"],
  "evidence": [
    {
      "pattern": "Nombre del patrón",
      "quote": "Cita exacta (max 60 chars)",
      "context": "Por qué este momento es revelador"
    }
  ]
}

## REGLAS DE PATRONES

MODO DEMO (3 patrones):
- 1 Emoción: El patrón emocional MÁS interesante que encontraste
- 1 Dinámica: Cómo funciona la comunicación entre ellos
- 1 Fortaleza: Algo positivo que destaque

MODO FULL (8 patrones):
- 2 Emoción, 2 Dinámica, 2 Fortaleza, 2 Riesgo
- Cada uno con "evidence" (cita del chat)

## EJEMPLOS DE TÍTULOS QUE GENERAN "WOW":
✅ "[Nombre] responde 3x más rápido después de las 11pm"
✅ "El emoji 😂 aparece 47 veces, pero solo 3 de [Nombre]"
✅ "Hay un patrón de silencios de 2-3 días cada 2 semanas"
✅ "[Nombre] usa 'perdón' 12 veces más que [Nombre2]"
✅ "Las conversaciones profundas solo ocurren entre 1am-3am"
✅ "El tono cambió drásticamente después del [fecha aproximada]"

## EJEMPLOS A EVITAR:
❌ "Buena comunicación" (genérico)
❌ "Hay química" (vago)
❌ "Problemas de confianza" (sin evidencia)
❌ "Necesitan hablar más" (obvio)

## IMPORTANTE PARA DEMO
En modo DEMO, los 3 patrones deben ser TAN buenos que el usuario NECESITE ver los otros 5. Muestra lo mejor que encontraste, no guardes lo bueno para FULL.
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

      // Chat metadata
      chatType: parsed.chatType ? {
        type: parsed.chatType.type || "1-on-1",
        participants: Array.isArray(parsed.chatType.participants) ? parsed.chatType.participants : [],
        relationshipType: parsed.chatType.relationshipType || "otro",
        chatDuration: parsed.chatType.chatDuration,
      } : undefined,

      // Core metric (ALWAYS present)
      patternScore: {
        value: typeof parsed.patternScore?.value === "number" ? parsed.patternScore.value : 7.5,
        label: parsed.patternScore?.label || "Salud de la conexión",
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