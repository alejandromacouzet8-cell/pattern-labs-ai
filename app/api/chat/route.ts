import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Máximo 80,000 caracteres de chat para evitar exceder límite de tokens
// WhatsApp chats tienen ratio ~1:1 caracteres:tokens por emojis/formato
// GPT-4o-mini = 128k tokens, reservamos margen para prompt + stats
const MAX_CHAT_CHARS = 80000;

type ChatStats = {
  totalMessages: number;
  participants: {
    name: string;
    messageCount: number;
    wordCount: number;
    avgWordsPerMessage: number;
    hourlyActivity?: Record<number, number>;
    mostActiveHours?: string;
  }[];
  totalWords: number;
  dateRange: { first: string | null; last: string | null };
  phraseCounts?: {
    phrase: string;
    total: number;
    byParticipant: Record<string, number>;
  }[];
};

type ChatBody = {
  analysis: string;
  fullChat: string;
  question: string;
  chatStats?: ChatStats; // Stats pre-calculadas del chat completo
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
  // Limpiar caracteres invisibles de WhatsApp (LTR mark, zero-width spaces, etc.)
  const cleanLine = (line: string) => line.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();

  const lines = chatText.split('\n').map(cleanLine).filter(line => line.length > 0);

  // Regex para formatos de WhatsApp - SOLO matchear líneas que empiecen con fecha/hora
  // Esto evita capturar contenido de mensajes como "**Título**: texto"
  const messagePatterns = [
    // Formato iOS/Android con corchetes: [15/12/24, 19:14:36] Nombre: mensaje
    /^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}[^\]]*)\]\s*([^:]+):\s*(.+)$/,
    // Formato Android sin corchetes: 15/12/24, 19:14 - Nombre: mensaje
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})[,\s]+\d{1,2}:\d{2}(?::\d{2})?\s*[-–]\s*([^:]+):\s*(.+)$/,
    // Formato alternativo: 15/12/24 19:14:36 Nombre: mensaje
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})[,\s]+\d{1,2}:\d{2}(?::\d{2})?\s+([^:]+):\s*(.+)$/,
  ];

  const participantStats: Record<string, { messageCount: number; wordCount: number }> = {};
  let totalMessages = 0;
  let totalWords = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  // Debug: mostrar primeras líneas para ver formato
  console.log("📝 Primeras 5 líneas del chat:");
  lines.slice(0, 5).forEach((line, i) => console.log(`  [${i}]: "${line}"`));

  // Debug: contar líneas que NO matchean ningún patrón
  let unmatchedLines = 0;

  for (const line of lines) {
    // Probar cada patrón hasta encontrar uno que coincida
    for (let patternIdx = 0; patternIdx < messagePatterns.length; patternIdx++) {
      const pattern = messagePatterns[patternIdx];
      const match = line.match(pattern);
      if (match) {
        // Todos los patrones tienen estructura: (fecha, nombre, mensaje)
        const date = match[1];
        const name = match[2].trim();
        const message = match[3]?.trim() || '';

        // Validar que el nombre no sea contenido de mensaje (ej: **Título**)
        if (name.startsWith('*') || name.startsWith('#') || name.startsWith('-') || name.length > 50) {
          continue;
        }

        // Ignorar si no hay mensaje
        if (!message) continue;

        // Ignorar mensajes del sistema y media omitida
        const lowerMessage = message.toLowerCase();
        const lowerName = name.toLowerCase();
        if (lowerMessage.includes('omitido') ||
            lowerMessage.includes('omitida') ||  // "imagen omitida", "nota de voz omitida"
            lowerMessage.includes('omitted') ||
            lowerMessage.includes('cifrados de extremo a extremo') ||
            lowerMessage.includes('end-to-end encrypted') ||
            lowerMessage.includes('creaste el grupo') ||
            lowerMessage.includes('created group') ||
            lowerMessage.includes('cambiaste el nombre') ||
            lowerMessage.includes('changed the subject') ||
            lowerName.includes('changed') ||
            lowerName.includes('added') ||
            lowerName.includes('left') ||
            lowerName.includes('removed') ||
            lowerName.includes('created group')) {
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
    // Si ningún patrón matcheó, contar como línea no parseada
    if (!messagePatterns.some(p => p.test(line))) {
      unmatchedLines++;
    }
  }

  console.log("📊 Estadísticas calculadas:", {
    totalMessages,
    participants: Object.keys(participantStats),
    unmatchedLines,
    totalLines: lines.length,
    matchRate: `${Math.round((totalMessages / lines.length) * 100)}%`
  });

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
    const { analysis, fullChat, question, chatStats: preCalculatedStats } = (await req.json()) as ChatBody;

    if (!fullChat || !question) {
      return NextResponse.json(
        { error: "Faltan datos para responder la pregunta." },
        { status: 400 }
      );
    }

    // 📊 USAR STATS PRE-CALCULADAS del chat COMPLETO (si vienen del analyze)
    // Si no vienen, calcular del chat truncado (fallback)
    let stats: ChatStats;
    if (preCalculatedStats && preCalculatedStats.totalMessages > 0) {
      console.log("📊 Usando stats PRE-CALCULADAS del chat completo:");
      stats = preCalculatedStats;
    } else {
      console.log(`📊 Stats no disponibles, calculando del chat recibido (${fullChat.length.toLocaleString()} chars)...`);
      stats = calculateChatStats(fullChat);
    }
    console.log("📊 Stats finales:", {
      totalMessages: stats.totalMessages,
      participants: stats.participants.map(p => `${p.name}: ${p.messageCount} msgs`),
    });

    // ✂️ Truncar chat para el contexto de la IA (pero stats ya son del chat completo)
    const trimmedChat =
      fullChat.length > MAX_CHAT_CHARS
        ? fullChat.slice(-MAX_CHAT_CHARS)
        : fullChat;

    // 📊 Formatear estadísticas para el prompt
    const phraseStats = stats.phraseCounts?.slice(0, 15).map(p => {
      const breakdown = Object.entries(p.byParticipant).map(([name, count]) => `${name}: ${count}`).join(', ');
      return `  • "${p.phrase}": ${p.total} veces (${breakdown})`;
    }).join('\n') || '';

    const statsForPrompt = `
═══════════════════════════════════════════════════════════
📊 ESTADÍSTICAS PRE-CALCULADAS (NÚMEROS EXACTOS - USA ESTOS)
═══════════════════════════════════════════════════════════
• Total de mensajes en el chat: ${stats.totalMessages}
• Total de palabras: ${stats.totalWords}
• Rango de fechas: ${stats.dateRange.first || 'N/A'} → ${stats.dateRange.last || 'N/A'}

PARTICIPANTES (ordenados por cantidad de mensajes):
${stats.participants.map((p, i) => {
  const hourInfo = (p as any).mostActiveHours ? ` | ${(p as any).mostActiveHours}` : '';
  return `  ${i + 1}. ${p.name}: ${p.messageCount} mensajes, ${p.wordCount} palabras (promedio ${p.avgWordsPerMessage} palabras/mensaje)${hourInfo}`;
}).join('\n')}

${phraseStats ? `CONTEO DE FRASES EN TODO EL CHAT:\n${phraseStats}` : ''}

⚠️ IMPORTANTE: Estos números fueron calculados por el sistema y son EXACTOS.
- Cuando pregunten "quién manda más mensajes" → USA ESTOS NÚMEROS
- Cuando pregunten "cuántas veces dijeron X" → USA EL CONTEO DE FRASES de arriba
- Cuando pregunten "a qué hora" o "cuándo" → USA LOS HORARIOS de arriba
- NO intentes contar manualmente, estos datos son del chat COMPLETO
═══════════════════════════════════════════════════════════
`;

    const prompt = `
Eres un ANALISTA DE COMUNICACIÓN DE NIVEL ÉLITE. Tu misión: hacer que el usuario diga "¿Cómo supo eso?" con cada respuesta.

No eres un chatbot genérico. Eres el mejor amigo brutalmente honesto que también tiene un doctorado en psicología relacional. Hablas directo, con ejemplos específicos del chat, y siempre sorprendes con observaciones que el usuario no había notado.

═══════════════════════════════════════════════════════════
🚨 REGLA CRÍTICA: PERSPECTIVA OBJETIVA
═══════════════════════════════════════════════════════════
- NO sabes quién es el usuario. Puede ser cualquiera de los participantes o un tercero.
- NUNCA uses "tú", "contigo", "te", "tu relación" refiriéndote a un participante específico.
- SIEMPRE habla de los participantes por su NOMBRE: "Alejandro muestra...", "La relación entre María y Juan..."
- Habla como un analista externo observando el chat, NO como si hablaras con uno de ellos.
- Si el usuario pregunta "¿me quiere?" → responde sobre ambos participantes o pide aclaración.

EJEMPLOS:
❌ MAL: "Él te busca mucho, lo que indica que te quiere"
✅ BIEN: "Alejandro busca mucho a María, lo que indica interés de su parte"

❌ MAL: "Tu pareja muestra señales de..."
✅ BIEN: "La dinámica entre Alejandro y María muestra..."
═══════════════════════════════════════════════════════════

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

FORMATO DE RESPUESTA (texto plano, pero estructurado para impactar):

═══════════════════════════════════════════════════════════
ESTRUCTURA OBLIGATORIA - SIGUE ESTE ORDEN:
═══════════════════════════════════════════════════════════

1️⃣ HEADLINE CON DATO BOMBA (primera línea, impactante):
Empieza con un número o porcentaje que enganche. Ejemplos:
- "Basándome en ${stats.totalMessages} mensajes: 78% de probabilidad de que sí te quiere."
- "Encontré 847 veces que [Nombre] dijo 'te amo' vs 203 tuyas. Pero esto no es malo..."
- "El indicador de reciprocidad está en 6.8/10. Aquí está el por qué:"

2️⃣ DATOS CLAVE EN NÚMEROS (4-6 stats específicos):
📊 Los números que importan:
• [Nombre] dijo "te amo/te quiero": X veces
• [Otro nombre] lo dijo: Y veces
• Quién inicia conversaciones: [Nombre] X% de las veces
• Tiempo promedio de respuesta: [dato si lo tienes]
• Hora más activa de [Nombre]: [hora]
• Total de mensajes analizados: ${stats.totalMessages}

3️⃣ LA CITA QUE REVELA TODO (obligatorio):
Busca UN mensaje específico que sea revelador y cítalo:
"El [fecha aproximada], [Nombre] escribió: '[cita textual del chat]'"
→ Esto revela que [interpretación].

4️⃣ LO QUE ENCONTRÉ (3-4 hallazgos con emojis):
💚 [Señal positiva con evidencia específica]
💚 [Otra señal positiva]
⚠️ [Señal de atención - algo a observar]
💚 o ⚠️ [Otro hallazgo relevante]

5️⃣ MI LECTURA PROFUNDA (2-3 oraciones):
Conecta los puntos. Explica el "por qué" detrás de los patrones.
Sé honesto pero empático. No tengas miedo de decir verdades incómodas.

6️⃣ VEREDICTO FINAL CON SCORE:
🎯 Mi veredicto: [Respuesta directa a la pregunta en 1 oración]
Índice de [lo que preguntaron]: X.X/10
→ [Qué significa ese score en 1 línea]

7️⃣ SI QUIEREN MEJORAR (opcional, 2 acciones):
→ [Acción específica y realista]
→ [Segunda acción basada en lo observado]

═══════════════════════════════════════════════════════════
IMPORTANTE: USA LOS NÚMEROS REALES DE LAS ESTADÍSTICAS DE ARRIBA.
No inventes datos. Si no tienes un dato específico, omítelo.
═══════════════════════════════════════════════════════════

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
      max_tokens: 1500,  // Más espacio para respuestas estructuradas con datos
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
