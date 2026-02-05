import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Máximo 80,000 caracteres de chat para evitar exceder límite de tokens
// WhatsApp chats tienen ratio ~1:1 caracteres:tokens por emojis/formato
// GPT-4o-mini = 128k tokens, reservamos margen para prompt + stats
const MAX_CHAT_CHARS = 80000;

type ChatBody = {
  analysis: string;
  fullChat: string;
  question: string;
};

/**
 * 📊 PRE-CALCULAR ESTADÍSTICAS DEL CHAT
 * Esto garantiza precisión en conteos que la IA no puede hacer bien
 */
function calculateChatStats(chatText: string): {
  totalMessages: number;
  participants: { name: string; messageCount: number; wordCount: number; avgWordsPerMessage: number }[];
  totalWords: number;
  dateRange: { first: string | null; last: string | null };
} {
  const lines = chatText.split('\n').filter(line => line.trim());

  // Regex SUPER permisivo para capturar cualquier formato de WhatsApp
  // Busca: [fecha/hora opcional] Nombre: mensaje
  // El patrón clave es "Nombre: mensaje" después de algo que parece fecha/hora
  const messagePatterns = [
    // Formato con corchetes: [cualquier cosa] Nombre: mensaje
    /^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/,
    // Formato estándar con guión: fecha/hora - Nombre: mensaje
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})[,\s]*\d{1,2}:\d{2}[^-–]*[-–]\s*([^:]+):\s*(.+)$/,
    // Formato solo con coma: fecha, hora, Nombre: mensaje
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})[,\s]+\d{1,2}:\d{2}[^:]*:\s*(\d{2})?\s*([^:]+):\s*(.+)$/,
    // Formato más simple: buscar patrón "Nombre: mensaje" después de números
    /^[\d\/\-\.\s,:apmAPM\[\]]+[-–]?\s*([^:]{2,30}):\s*(.+)$/,
  ];

  const participantStats: Record<string, { messageCount: number; wordCount: number }> = {};
  let totalMessages = 0;
  let totalWords = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  // Debug: mostrar primeras líneas para ver formato
  console.log("📝 Primeras 3 líneas del chat:", lines.slice(0, 3));

  for (const line of lines) {
    // Probar cada patrón hasta encontrar uno que coincida
    for (let patternIdx = 0; patternIdx < messagePatterns.length; patternIdx++) {
      const pattern = messagePatterns[patternIdx];
      const match = line.match(pattern);
      if (match) {
        // Los grupos varían según el patrón
        let name: string;
        let message: string;
        let date: string | null = null;

        if (patternIdx === 3) {
          // Último patrón: solo tiene (nombre, mensaje)
          name = match[1].trim();
          message = match[2].trim();
        } else if (patternIdx === 2 && match[4]) {
          // Patrón con segundos extra
          name = match[3].trim();
          message = match[4].trim();
          date = match[1];
        } else {
          // Patrones estándar: (fecha/contexto, nombre, mensaje)
          date = match[1];
          name = match[2].trim();
          message = match[3]?.trim() || '';
        }

        // Ignorar si no hay mensaje
        if (!message) continue;

        // Ignorar mensajes del sistema
        if (message.includes('<Media omitted>') ||
            message.includes('omitido') ||
            message.includes('Messages and calls are end-to-end encrypted') ||
            message.includes('cifrados de extremo a extremo') ||
            message.includes('image omitted') ||
            message.includes('video omitted') ||
            message.includes('audio omitted') ||
            message.includes('sticker omitted') ||
            message.includes('GIF omitted') ||
            name.toLowerCase().includes('changed') ||
            name.toLowerCase().includes('added') ||
            name.toLowerCase().includes('left') ||
            name.toLowerCase().includes('removed') ||
            name.toLowerCase().includes('created group')) {
          break;
        }

        // Guardar fechas
        if (date) {
          if (!firstDate) firstDate = date;
          lastDate = date;
        }

        // Contar palabras
        const words = message.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;

        if (!participantStats[name]) {
          participantStats[name] = { messageCount: 0, wordCount: 0 };
        }

        participantStats[name].messageCount++;
        participantStats[name].wordCount += wordCount;
        totalMessages++;
        totalWords += wordCount;
        break;
      }
    }
  }

  console.log("📊 Estadísticas calculadas:", { totalMessages, participants: Object.keys(participantStats) });

  // Convertir a array ordenado por cantidad de mensajes
  const participants = Object.entries(participantStats)
    .map(([name, stats]) => ({
      name,
      messageCount: stats.messageCount,
      wordCount: stats.wordCount,
      avgWordsPerMessage: stats.messageCount > 0 ? Math.round(stats.wordCount / stats.messageCount * 10) / 10 : 0,
    }))
    .sort((a, b) => b.messageCount - a.messageCount);

  return {
    totalMessages,
    participants,
    totalWords,
    dateRange: { first: firstDate, last: lastDate },
  };
}

export async function POST(req: Request) {
  try {
    const { analysis, fullChat, question } = (await req.json()) as ChatBody;

    if (!fullChat || !question) {
      return NextResponse.json(
        { error: "Faltan datos para responder la pregunta." },
        { status: 400 }
      );
    }

    // ✂️ Recortamos chat enorme para evitar errores
    const trimmedChat =
      fullChat.length > MAX_CHAT_CHARS
        ? fullChat.slice(-MAX_CHAT_CHARS)
        : fullChat;

    // 📊 PRE-CALCULAR ESTADÍSTICAS (precisión garantizada)
    const stats = calculateChatStats(trimmedChat);
    console.log("📊 Stats pre-calculadas:", {
      totalMessages: stats.totalMessages,
      participants: stats.participants.map(p => `${p.name}: ${p.messageCount} msgs`),
    });

    // 📊 Formatear estadísticas para el prompt
    const statsForPrompt = `
═══════════════════════════════════════════════════════════
📊 ESTADÍSTICAS PRE-CALCULADAS (NÚMEROS EXACTOS - USA ESTOS)
═══════════════════════════════════════════════════════════
• Total de mensajes en el chat: ${stats.totalMessages}
• Total de palabras: ${stats.totalWords}
• Rango de fechas: ${stats.dateRange.first || 'N/A'} → ${stats.dateRange.last || 'N/A'}

PARTICIPANTES (ordenados por cantidad de mensajes):
${stats.participants.map((p, i) => `  ${i + 1}. ${p.name}: ${p.messageCount} mensajes, ${p.wordCount} palabras (promedio ${p.avgWordsPerMessage} palabras/mensaje)`).join('\n')}

⚠️ IMPORTANTE: Estos números fueron calculados por el sistema y son EXACTOS.
Cuando el usuario pregunte "quién manda más mensajes" o estadísticas similares,
USA ESTOS NÚMEROS directamente. NO intentes contar manualmente.
═══════════════════════════════════════════════════════════
`;

    const prompt = `
Eres un psicólogo experto en relaciones, comunicación por chat y dinámicas afectivas.
Responde SIEMPRE en español neutro, con un tono empático pero claro.

${statsForPrompt}

INTERPRETACIÓN DE PREGUNTAS:
⚠️ IMPORTANTE: El usuario puede escribir con errores tipográficos o de forma informal.
INTERPRETA la intención de la pregunta:
- "quien es ool" o "quien es cool" → ¿Quién es más cool/interesante?
- "mejro" → "mejor"
- "kien" → "quién"
- "q" → "que"
- "xq" → "por qué"
- "msjs" → "mensajes"
Si no entiendes algo, intenta deducir por contexto. NO pidas aclaraciones, responde tu mejor interpretación.

TU TAREA:
Usa el ANÁLISIS PREVIO, las ESTADÍSTICAS PRE-CALCULADAS y el fragmento del chat para responder
de forma DIRECTA y ÚTIL a la pregunta de la persona. No inventes cosas que no se vean en el chat.
Habla de "señales" y "patrones", no de verdades absolutas.

CAPACIDAD DE CONTEO Y ESTADÍSTICAS:
⚠️ REGLA CRÍTICA: Para preguntas sobre conteos (quién manda más, cuántos mensajes, etc.),
USA SIEMPRE las ESTADÍSTICAS PRE-CALCULADAS arriba. Estos números son EXACTOS.

Ejemplos de cómo responder:
- "¿Quién manda más mensajes?" → Usa los números de arriba: "[Nombre] envió X mensajes vs [Nombre] con Y mensajes"
- "¿Cuántos mensajes hay?" → "El chat tiene [total de arriba] mensajes"
- "¿Quién escribe más largo?" → Usa el promedio de palabras/mensaje de arriba
- "¿Quién es mejor/cool/más interesante?" → Analiza patrones de comunicación para dar perspectiva

Para conteos de PALABRAS o FRASES ESPECÍFICAS (ej: "cuántas veces dijo te amo"):
1) Cuenta literalmente en el chat la frase exacta
2) Da el número exacto encontrado
3) Si es posible, desglosa quién lo dijo

OBJETIVOS DE LA RESPUESTA:
1) Responder primero a la pregunta del usuario de forma clara y directa.
2) Si es pregunta de conteo: dar el número exacto primero.
3) Explicar qué señales o patrones se observan en el chat relacionados con la pregunta.
4) Dar entre 2 y 5 recomendaciones concretas y accionables para la persona.
5) Mantener un tono que acompañe, no que juzgue.

LÍMITES IMPORTANTES:
- NO diagnostiques clínicamente (no digas "tiene trastorno X" ni "es narcisista").
- No des órdenes absolutas del tipo "debes terminar la relación"; ofrece alternativas
  y posibles caminos ("podrías", "una opción sería...").
- No inventes detalles que no se vean en el análisis o en el chat. Si faltan datos,
  dilo explícitamente.
- Si el chat es corto o confuso, acláralo y da una respuesta proporcional.
- Para conteos: si el chat está truncado, aclara que el conteo es sobre la porción visible.

ESTILO:
- Habla como alguien profesional pero cercano.
- Usa frases claras, sin tecnicismos innecesarios.
- Puedes usar bullets cuando sirva para que la persona entienda mejor.
- Evita repetir demasiado el mismo concepto.

FORMATO DE LA RESPUESTA:
- NO uses símbolos de markdown como # o ** o *.
- NO pongas títulos con "#".
- Usa texto plano con saltos de línea para organizar.
- Puedes usar emojis como viñetas (•, →, ✓) pero NO markdown.

ESTRUCTURA:
1) Una frase inicial directa que responda la pregunta.
2) "Lo que se ve en el chat:" seguido de 2–4 puntos clave.
3) "Qué significa esto:" explicando el trasfondo emocional.
4) "Qué puedes hacer:" con recomendaciones específicas y prácticas.

ANÁLISIS PREVIO:
${analysis}

ÚLTIMOS MENSAJES DEL CHAT (recortado automáticamente):
${trimmedChat}

PREGUNTA DEL USUARIO:
${question}
`.trim();

    // ✅ FIX: Usar OpenAI SDK correctamente (esto resuelve el error "not found")
    console.log("🤖 Generando respuesta para pregunta:", question.slice(0, 60));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    console.log("✅ Respuesta de IA generada exitosamente");

    let answer =
      completion.choices[0]?.message?.content?.trim() ??
      "No pude generar una respuesta.";

    // Limpiar símbolos de markdown que puedan aparecer
    answer = answer
      .replace(/^#+\s*/gm, '') // Quitar # al inicio de líneas
      .replace(/\*\*/g, '')    // Quitar **
      .replace(/\*/g, '')      // Quitar *
      .trim();

    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error("Error en /api/chat:", err);
    return NextResponse.json(
      {
        error:
          err?.message ??
          "Ocurrió un error inesperado al responder tu pregunta.",
      },
      { status: 500 }
    );
  }
}
