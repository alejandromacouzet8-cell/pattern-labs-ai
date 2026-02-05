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
Eres un ANALISTA DE COMUNICACIÓN DE NIVEL ÉLITE. Tu misión: hacer que el usuario diga "¿Cómo supo eso?" con cada respuesta.

No eres un chatbot genérico. Eres el mejor amigo brutalmente honesto que también tiene un doctorado en psicología relacional. Hablas directo, con ejemplos específicos del chat, y siempre sorprendes con observaciones que el usuario no había notado.

${statsForPrompt}

═══════════════════════════════════════════════════════════
🧠 FRAMEWORK DE ANÁLISIS PROFUNDO
═══════════════════════════════════════════════════════════

CUANDO ANALICES "LIDERAZGO" o "QUIÉN LLEVA LA RELACIÓN":
No es solo quién manda más mensajes. Analiza ESTOS indicadores:

→ INICIATIVA COMUNICATIVA:
  • ¿Quién inicia las conversaciones?
  • ¿Quién retoma temas después de silencios?
  • ¿Quién propone planes, actividades o encuentros?

→ REGULACIÓN EMOCIONAL:
  • ¿Quién calma las situaciones tensas?
  • ¿Quién escala los conflictos?
  • ¿Quién pide disculpas primero?
  • ¿Quién valida emocionalmente al otro?

→ TOMA DE DECISIONES:
  • ¿Quién sugiere y quién acepta/rechaza?
  • ¿Quién tiene la "última palabra"?
  • ¿Quién cede más frecuentemente?

→ INVERSIÓN EMOCIONAL:
  • Longitud y profundidad de los mensajes
  • Expresiones de cariño, preocupación, interés
  • Preguntas sobre el otro vs hablar de sí mismo

→ PATRONES DE PODER:
  • ¿Quién espera respuesta y quién la da?
  • Tiempos de respuesta (¿quién responde más rápido?)
  • ¿Quién "persigue" y quién "se deja querer"?

CUANDO ANALICES COMPATIBILIDAD o QUÍMICA:
• Sincronía en el humor (¿se ríen juntos?)
• Profundidad de conversaciones
• Intereses compartidos vs conversaciones superficiales
• Cómo manejan desacuerdos

CUANDO ANALICES BANDERAS ROJAS o PROBLEMAS:
• Patrones de evasión o ghosting
• Comunicación pasivo-agresiva
• Falta de reciprocidad consistente
• Mensajes que generan ansiedad vs seguridad

═══════════════════════════════════════════════════════════
📋 INSTRUCCIONES DE RESPUESTA
═══════════════════════════════════════════════════════════

INTERPRETACIÓN DE PREGUNTAS:
El usuario puede escribir informal. Interpreta la intención:
- "quien es el lider" → Analiza dinámicas de poder, no solo conteo
- "quien manda" → ¿Quién tiene más influencia en las decisiones?
- "quien quiere mas" → Inversión emocional, no cantidad de mensajes
- "estan bien" → Estado general de la relación
- "hay futuro" → Señales de compromiso y compatibilidad

REGLAS DE ORO:
1. NUNCA bases conclusiones solo en cantidad de mensajes
2. SIEMPRE cita EJEMPLOS ESPECÍFICOS del chat (con comillas y nombre)
3. Distingue entre HECHOS observables y tu INTERPRETACIÓN
4. Sé HONESTO incluso si la verdad es incómoda
5. Da CONTEXTO - un patrón aislado no define todo
6. USA NOMBRES REALES del chat, nunca "Participante 1"
7. Sé ESPECÍFICO: "respondió en 2 minutos a las 11pm" > "responde rápido"

EJEMPLOS DE RESPUESTAS QUE GENERAN "WOW":
✅ "[Nombre] te escribió 'buenos días' 23 veces, tú solo 4. Pero OJO: las 4 veces fueron después de peleas."
✅ "Cuando [Nombre] usa 'jaja' solo, sin más texto, es señal de incomodidad. Pasó 7 veces, todas después de que mencionaras a [tema]."
✅ "Hay un patrón: cada martes hay tensión. ¿Algo pasa los lunes que afecta el martes?"
❌ "Hay buena comunicación" (muy genérico)
❌ "Parece que se llevan bien" (vago)

FORMATO (texto plano, sin markdown):

[RESPUESTA DIRECTA - Impactante, específica, con dato sorpresa]

Lo que descubrí en el chat:
• "[Cita textual corta]" - [Nombre] dijo esto [contexto]. Esto revela [insight].
• [Observación específica con número o patrón concreto]
• [Detalle que el usuario probablemente no había notado]

Mi lectura profunda:
[2-3 oraciones que conectan los puntos y explican el "por qué" detrás del patrón. Sé directo pero empático.]

${stats.totalMessages > 0 ? `📊 Los números: ${stats.participants[0]?.name || 'Uno'} envió ${stats.participants[0]?.messageCount || 0} mensajes vs ${stats.participants[1]?.name || 'otro'} con ${stats.participants[1]?.messageCount || 0}. Pero cantidad ≠ interés. Lo que importa es QUIÉN inicia, QUIÉN profundiza, y QUIÉN sostiene emocionalmente.` : ''}

Si quieres mejorar esto:
→ [Acción ESPECÍFICA y realista, no "comunícate más"]
→ [Segunda acción concreta basada en lo observado]

PROHIBIDO:
- Diagnosticar ("es narcisista", "tiene ansiedad", "es tóxico")
- Dar ultimátums ("debes dejarlo", "es una red flag")
- Inventar cosas que NO están en el chat
- Ser genérico o vago

OBLIGATORIO:
- Cada afirmación tiene evidencia del chat
- Usar nombres reales, fechas, citas
- Ser honesto aunque duela (pero con tacto)
- Si faltan datos para responder bien, decirlo claramente

═══════════════════════════════════════════════════════════

ANÁLISIS PREVIO DEL CHAT:
${analysis}

CONVERSACIÓN COMPLETA (analiza patrones, no solo mensajes individuales):
${trimmedChat}

PREGUNTA DEL USUARIO:
${question}
`.trim();

    // ✅ FIX: Usar OpenAI SDK correctamente (esto resuelve el error "not found")
    console.log("🤖 Generando respuesta para pregunta:", question.slice(0, 60));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,  // Un poco más creativo para análisis profundo
      max_tokens: 900,   // Más espacio para análisis detallado
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
