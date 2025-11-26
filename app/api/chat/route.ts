import { NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Máximo 20,000 caracteres de chat para no saturar el modelo
const MAX_CHAT_CHARS = 20000;

type ChatBody = {
  analysis: string;
  fullChat: string;
  question: string;
};

export async function POST(req: Request) {
  try {
    if (!OPENAI_API_KEY) {
    return NextResponse.json(
        { error: "Falta la variable OPENAI_API_KEY en el servidor." },
        { status: 500 }
      );
    }

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
Eres un psicólogo experto en relaciones, comunicación por chat y dinámicas afectivas,un analista experto en comunicación emocional y patrones psicológicos.
Responde SIEMPRE en español neutro, con un tono empático pero claro.

TU TAREA:
Usa el ANÁLISIS PREVIO y el fragmento del chat para responder de forma DIRECTA y ÚTIL
a la pregunta de la persona. No inventes cosas que no se vean en el chat. Habla de
"señales" y "patrones", no de verdades absolutas.

OBJETIVOS DE LA RESPUESTA:
1) Responder primero a la pregunta del usuario de forma clara y directa.
2) Explicar qué señales o patrones se observan en el chat relacionados con la pregunta.
3) Dar entre 2 y 5 recomendaciones concretas y accionables para la persona.
4) Mantener un tono que acompañe, no que juzgue.

LÍMITES IMPORTANTES:
- NO diagnostiques clínicamente (no digas "tiene trastorno X" ni "es narcisista").
- No des órdenes absolutas del tipo "debes terminar la relación"; ofrece alternativas
  y posibles caminos ("podrías", "una opción sería...").
- No inventes detalles que no se vean en el análisis o en el chat. Si faltan datos,
  dilo explícitamente.
- Si el chat es corto o confuso, acláralo y da una respuesta proporcional.

ESTILO:
- Habla como alguien profesional pero cercano.
- Usa frases claras, sin tecnicismos innecesarios.
- Puedes usar bullets cuando sirva para que la persona entienda mejor.
- Evita repetir demasiado el mismo concepto.

ESTRUCTURA DE LA RESPUESTA:
1) Un título breve en una frase: por ejemplo, "Lo que se ve en tu relación ahora mismo".
2) Un bloque: "Lo que se ve en el chat", con 2–4 puntos clave sobre patrones/dinámicas.
3) Un bloque: "Qué significa para ti", explicando el trasfondo emocional.
4) Un bloque: "Qué puedes hacer ahora", con recomendaciones específicas y prácticas.

ANÁLISIS PREVIO:
${analysis}

ÚLTIMOS MENSAJES DEL CHAT (recortado automáticamente):
${trimmedChat}

PREGUNTA DEL USUARIO:
${question}
`.trim();

    const payload = {
      model: "gpt-4.1-mini",
      input: prompt,
      max_output_tokens: 700,
    };

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("OpenAI /api/chat error:", errorText);
      return NextResponse.json(
        { error: "Error al responder tu pregunta con la IA." },
        { status: 500 }
      );
    }

    const json = await openaiRes.json();

    const answer =
      json?.output?.[0]?.content?.[0]?.text ??
      "No pude generar una respuesta.";

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
