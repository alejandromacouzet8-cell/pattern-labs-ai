import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Máximo 100,000 caracteres de chat para permitir conteos precisos
// GPT-4o-mini tiene 128k context, esto permite estadísticas exactas
const MAX_CHAT_CHARS = 100000;

type ChatBody = {
  analysis: string;
  fullChat: string;
  question: string;
};

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

    const prompt = `
Eres un psicólogo experto en relaciones, comunicación por chat y dinámicas afectivas, un analista experto en comunicación emocional y patrones psicológicos.
Responde SIEMPRE en español neutro, con un tono empático pero claro.

TU TAREA:
Usa el ANÁLISIS PREVIO y el fragmento del chat para responder de forma DIRECTA y ÚTIL
a la pregunta de la persona. No inventes cosas que no se vean en el chat. Habla de
"señales" y "patrones", no de verdades absolutas.

CAPACIDAD DE CONTEO Y ESTADÍSTICAS:
Cuando el usuario pregunte por CONTEOS o ESTADÍSTICAS (ejemplos: "cuántas veces dijo te amo",
"quién manda más mensajes", "cuántos mensajes hay", "cuántas veces dijo X palabra"):
1) CUENTA literalmente en el chat y da el NÚMERO EXACTO.
2) Presenta el resultado de forma clara: "Se encontraron X veces la frase 'te amo' en el chat."
3) Si es posible, desglosa quién dijo qué (ej: "Persona A lo dijo 15 veces, Persona B 8 veces").
4) Si la frase/palabra no aparece o aparece muy poco, dilo claramente.
5) NUNCA respondas de forma vaga como "varias veces" o "frecuentemente" cuando te piden un número.

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
