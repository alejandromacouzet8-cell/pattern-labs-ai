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

type ParticipantStats = {
  name: string;
  messageCount: number;
  wordCount: number;
  avgWordsPerMessage: number;
  hourlyActivity?: Record<number, number>; // hora (0-23) -> cantidad de mensajes
  mostActiveHours?: string; // ej: "más activo entre 10pm-2am"
};

type PhraseCounts = {
  phrase: string;
  total: number;
  byParticipant: Record<string, number>;
};

type ChatStats = {
  totalMessages: number;
  participants: ParticipantStats[];
  totalWords: number;
  dateRange: { first: string | null; last: string | null };
  phraseCounts?: PhraseCounts[]; // Conteo de frases importantes
};

/* =======================
   Función para calcular estadísticas del chat COMPLETO
   Esto garantiza conteos precisos independientemente del truncado
======================= */

function calculateChatStats(chatText: string): ChatStats {
  // Limpiar caracteres invisibles de WhatsApp
  const cleanLine = (line: string) => line.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
  const lines = chatText.split('\n').map(cleanLine).filter(line => line.length > 0);

  // Regex para formatos de WhatsApp - captura fecha/hora completa
  const messagePatterns = [
    /^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s*(\d{1,2}):(\d{2})(?::\d{2})?\]?\s*([^:]+):\s*(.+)$/,
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*[-–]\s*([^:]+):\s*(.+)$/,
  ];

  const participantStats: Record<string, {
    messageCount: number;
    wordCount: number;
    hourlyActivity: Record<number, number>;
  }> = {};
  let totalMessages = 0;
  let totalWords = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const line of lines) {
    for (const pattern of messagePatterns) {
      const match = line.match(pattern);
      if (match) {
        const date = match[1];
        const hour = parseInt(match[2], 10);
        const name = match[4].trim();
        const message = match[5]?.trim() || '';

        // Validar que el nombre no sea contenido de mensaje
        if (name.startsWith('*') || name.startsWith('#') || name.startsWith('-') || name.length > 50) {
          continue;
        }

        if (!message) continue;

        // Ignorar mensajes del sistema y media
        const lowerMessage = message.toLowerCase();
        const lowerName = name.toLowerCase();
        if (lowerMessage.includes('omitido') ||
            lowerMessage.includes('omitida') ||
            lowerMessage.includes('omitted') ||
            lowerMessage.includes('cifrados de extremo a extremo') ||
            lowerMessage.includes('end-to-end encrypted') ||
            lowerMessage.includes('creaste el grupo') ||
            lowerMessage.includes('cambiaste el nombre') ||
            lowerName.includes('changed') ||
            lowerName.includes('added') ||
            lowerName.includes('left')) {
          break;
        }

        if (date) {
          if (!firstDate) firstDate = date;
          lastDate = date;
        }

        const words = message.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;

        if (!participantStats[name]) {
          participantStats[name] = { messageCount: 0, wordCount: 0, hourlyActivity: {} };
        }

        participantStats[name].messageCount++;
        participantStats[name].wordCount += wordCount;

        // Registrar actividad por hora
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
          participantStats[name].hourlyActivity[hour] = (participantStats[name].hourlyActivity[hour] || 0) + 1;
        }

        totalMessages++;
        totalWords += wordCount;
        break;
      }
    }
  }

  // Función para encontrar las horas más activas
  const getMostActiveHours = (hourlyActivity: Record<number, number>): string => {
    const entries = Object.entries(hourlyActivity).map(([h, c]) => ({ hour: parseInt(h), count: c }));
    if (entries.length === 0) return "sin datos de horario";

    entries.sort((a, b) => b.count - a.count);
    const topHours = entries.slice(0, 3).map(e => {
      const h = e.hour;
      const period = h >= 12 ? 'pm' : 'am';
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${hour12}${period}`;
    });
    return `más activo: ${topHours.join(', ')}`;
  };

  const participants = Object.entries(participantStats)
    .map(([name, stats]) => ({
      name,
      messageCount: stats.messageCount,
      wordCount: stats.wordCount,
      avgWordsPerMessage: stats.messageCount > 0 ? Math.round(stats.wordCount / stats.messageCount * 10) / 10 : 0,
      hourlyActivity: stats.hourlyActivity,
      mostActiveHours: getMostActiveHours(stats.hourlyActivity),
    }))
    .sort((a, b) => b.messageCount - a.messageCount);

  // 📊 CONTAR FRASES IMPORTANTES EN TODO EL CHAT
  const phrasesToCount = [
    'te amo', 'te quiero', 'i love you', 'love you',
    'perdón', 'perdona', 'lo siento', 'sorry',
    'gracias', 'thank',
    'te extraño', 'te extrañ', 'miss you',
    'buenos días', 'buenas noches', 'good morning', 'good night',
    'jajaj', 'jeje', 'haha', 'lol', '😂', '🤣',
    '❤', '😍', '🥰', '😘', '💕', '💗', '💖',
    '?', // preguntas
  ];

  const phraseCounts: PhraseCounts[] = [];

  for (const phrase of phrasesToCount) {
    const byParticipant: Record<string, number> = {};
    let total = 0;

    // Contar en cada mensaje por participante
    for (const line of lines) {
      for (const pattern of messagePatterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[4]?.trim() || match[2]?.trim();
          const message = (match[5] || match[3] || '').toLowerCase();

          if (name && message) {
            // Contar ocurrencias de la frase en este mensaje
            const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = message.match(regex);
            if (matches) {
              const count = matches.length;
              byParticipant[name] = (byParticipant[name] || 0) + count;
              total += count;
            }
          }
          break;
        }
      }
    }

    if (total > 0) {
      phraseCounts.push({ phrase, total, byParticipant });
    }
  }

  // Ordenar por total descendente
  phraseCounts.sort((a, b) => b.total - a.total);

  return { totalMessages, participants, totalWords, dateRange: { first: firstDate, last: lastDate }, phraseCounts };
}

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

  // Estadísticas pre-calculadas del chat COMPLETO (antes de truncar)
  chatStats?: ChatStats;
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
- Usar "tú", "contigo", "tu pareja" - NO sabes quién es el usuario

## PERSPECTIVA OBJETIVA (MUY IMPORTANTE)
- NO sabes quién subió el chat. Puede ser cualquier participante o un tercero.
- SIEMPRE habla de los participantes por su NOMBRE, nunca como "tú" o "tu pareja".
- Escribe como un analista externo: "María muestra...", "La relación entre Juan y Ana..."
- NUNCA: "Tu pareja te ignora" → SÍ: "Pedro tiende a ignorar los mensajes de Laura"

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

MODO DEMO (6 patrones):
- Los primeros 3 patrones serán 100% visibles para el usuario (estos deben ser los MÁS impactantes)
- Los últimos 3 patrones aparecerán como "preview bloqueado" para generar curiosidad
- Distribución: 1-2 Emoción, 1-2 Dinámica, 1-2 Fortaleza, 1-2 Riesgo
- El orden importa: pon los 3 mejores primero

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
En modo DEMO devuelves 6 patrones:
- Los primeros 3: deben ser TAN buenos que el usuario diga "wow" al leerlos. Son 100% visibles.
- Los siguientes 3: aparecerán como "preview bloqueado" - sus TÍTULOS serán visibles pero la descripción estará borrosa. Haz que los títulos generen MUCHA curiosidad para que el usuario quiera desbloquear.
- Ejemplo de título que genera curiosidad para patrón bloqueado: "El mensaje del 15 de enero que cambió todo", "Por qué [Nombre] evita hablar después de las 10pm", "La frase que [Nombre] repite 23 veces"
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

    // 📊 CALCULAR ESTADÍSTICAS DEL CHAT COMPLETO (antes de truncar)
    console.log("📊 Calculando estadísticas del chat completo...");
    const chatStats = calculateChatStats(text);
    console.log("📊 STATS DEL CHAT COMPLETO:", {
      totalMessages: chatStats.totalMessages,
      totalWords: chatStats.totalWords,
      participants: chatStats.participants.map(p => `${p.name}: ${p.messageCount} msgs, ${p.wordCount} palabras (${p.mostActiveHours})`),
      dateRange: chatStats.dateRange,
      topPhrases: chatStats.phraseCounts?.slice(0, 10).map(p => `"${p.phrase}": ${p.total} veces`),
    });

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
MODO: ${isFullMode ? "FULL (devuelve EXACTAMENTE 8 patrones con evidencia: 2 Emoción, 2 Dinámica, 2 Fortaleza, 2 Riesgo)" : "DEMO (devuelve EXACTAMENTE 6 patrones: los 3 primeros son los MÁS impactantes y serán 100% visibles, los 3 siguientes aparecerán como preview bloqueado. Mezcla categorías: Emoción, Dinámica, Fortaleza, y al menos 1 Riesgo)"}

═══════════════════════════════════════════════════════════
📊 ESTADÍSTICAS EXACTAS DEL CHAT COMPLETO (USA ESTOS NÚMEROS)
═══════════════════════════════════════════════════════════
• Total de mensajes: ${chatStats.totalMessages}
• Total de palabras: ${chatStats.totalWords}
• Período: ${chatStats.dateRange.first || 'N/A'} → ${chatStats.dateRange.last || 'N/A'}

PARTICIPANTES:
${chatStats.participants.map((p, i) => `  ${i + 1}. ${p.name}: ${p.messageCount} mensajes (${Math.round(p.messageCount / chatStats.totalMessages * 100)}%), ${p.wordCount} palabras, promedio ${p.avgWordsPerMessage} palabras/msg | ${p.mostActiveHours || ''}`).join('\n')}

CONTEO DE FRASES EN TODO EL CHAT:
${chatStats.phraseCounts?.slice(0, 15).map(p => {
  const breakdown = Object.entries(p.byParticipant).map(([name, count]) => `${name}: ${count}`).join(', ');
  return `  • "${p.phrase}": ${p.total} veces total (${breakdown})`;
}).join('\n') || 'Sin datos de frases'}

⚠️ IMPORTANTE: Cuando menciones estadísticas en tu análisis, USA ESTOS NÚMEROS EXACTOS.
NO inventes números - usa los datos reales de arriba.
═══════════════════════════════════════════════════════════

Este es un chat exportado de WhatsApp${wasTruncated ? ' (mostrando mensajes más recientes, pero las estadísticas son del chat COMPLETO)' : ''}.

Reglas:
- Cada línea es un mensaje
- El nombre antes de ":" indica quién habla
- El orden es cronológico
- SIEMPRE usa las estadísticas exactas de arriba, NO inventes números
- ${isFullMode ? 'Incluye el campo "evidence" en cada patrón con una cita corta' : 'NO incluyas el campo "evidence" en los patrones'}

CHAT (${wasTruncated ? 'muestra reciente' : 'completo'}):
${processedText}
`,
        },
      ],
    });

    const aiText =
      completion.choices[0]?.message?.content?.trim() ?? "";

    console.log("🧠 AI RAW OUTPUT:", aiText);

    /* =======================
       PARSEO CON TOLERANCIA A ERRORES COMUNES
    ======================= */

    let parsed: any;

    // Limpiar JSON de errores comunes de la IA (comas extra, etc.)
    const cleanJson = (text: string) => {
      return text
        // Quitar comas antes de } o ]
        .replace(/,(\s*[}\]])/g, '$1')
        // Quitar comas dobles
        .replace(/,,+/g, ',');
    };

    try {
      parsed = JSON.parse(cleanJson(aiText));
    } catch (err) {
      console.error("❌ JSON inválido devuelto por IA:", aiText);
      // Intentar extraer JSON del texto (a veces la IA agrega texto antes/después)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(cleanJson(jsonMatch[0]));
          console.log("✅ JSON recuperado después de limpieza");
        } catch {
          return NextResponse.json(
            { error: "La IA devolvió una respuesta inválida. Intenta nuevamente." },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "La IA devolvió una respuesta inválida. Intenta nuevamente." },
          { status: 500 }
        );
      }
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

      // Estadísticas pre-calculadas del chat COMPLETO (para Q&A preciso)
      chatStats,
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