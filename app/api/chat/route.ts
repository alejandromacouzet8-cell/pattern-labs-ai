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
Eres un psicólogo experto en dinámicas afectivas.

Responde de manera empática, útil y basada en datos REALES del análisis y del chat.
No inventes información.

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
      max_output_tokens: 500,
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
