import { NextResponse } from 'next/server';

type ReportBadge = {
  label: string;
  level: 'low' | 'medium' | 'high';
  emoji: string;
};

type ReportSection = {
  id: string;
  title: string;
  body: string;
};

type AnalyzeResult = {
  ok: boolean;
  fileName: string;
  length: number;
  score: number | null;
  tlDr: string[];
  strengths: string[];
  risks: string[];
  badges: ReportBadge[];
  sections: ReportSection[];
  rawAnalysis: string;
  fullChat: string;
};

export async function POST(req: Request) {
  try {
    // 🔹 LEER EL ARCHIVO COMO FORM DATA (NADA DE JSON)
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No se recibió ningún archivo .txt.' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const fileName = (file as any).name ?? 'chat.txt';
    const length = text.length;

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'El archivo está vacío.' },
        { status: 400 }
      );
    }

    // 🔹 AQUÍ NO USAMOS OPENAI (REPORTE FAKE PARA PROBAR TODO EL FLUJO)
    const result: AnalyzeResult = {
      ok: true,
      fileName,
      length,
      score: 7.8,
      tlDr: [
        'Relación con buena base emocional, pero con momentos de tensión.',
        'Hay una persona que inicia más las conversaciones que la otra.',
        'Se observa interés mutuo, aunque la comunicación podría ser más clara.'
      ],
      strengths: [
        'Mensajes frecuentes de apoyo y contención emocional.',
        'Capacidad para resolver conflictos después de discusiones intensas.'
      ],
      risks: [
        'Algunos periodos de silencio largos después de discusiones.',
        'Comentarios pasivo-agresivos en momentos de frustración.'
      ],
      badges: [
        {
        label: 'Comunicación emocional intensa',
        level: 'medium',
        emoji: '💬'
        },
        {
        label: 'Buena base afectiva',
        level: 'low',
        emoji: '💚'
        },
        {
        label: 'Riesgo de desgaste',
        level: 'medium',
        emoji: '⚠️'
        }
      ],
      sections: [
        {
          id: 'resumen',
          title: 'Resumen general de la relación',
          body:
`En esta conversación se observa una relación con un vínculo emocional fuerte, donde ambas partes muestran interés, cariño y necesidad de conexión. 
Hay momentos de ternura, bromas internas y referencias a experiencias compartidas, lo que sugiere una historia en común y una base afectiva real.

Al mismo tiempo, aparecen episodios de tensión, malentendidos y cierta dificultad para expresar directamente lo que necesitan. 
Uno de los dos tiende a tomar más la iniciativa para escribir, lo que puede generar sensación de desequilibrio si no se habla abiertamente.

En general, la relación tiene mucho potencial, siempre que la comunicación sea cada vez más honesta, específica y madura.`
        },
        {
          id: 'dinamica',
          title: 'Dinámica de comunicación',
          body:
`La dinámica del chat muestra que una de las personas inicia la mayoría de las conversaciones, propone planes o intenta retomar el contacto después de silencios. 
La otra persona responde, pero a veces con mensajes cortos, tardíos o ambiguos.

Esto no significa necesariamente falta de interés, pero sí puede percibirse como desbalance en el esfuerzo. 
Cuando hay buena conexión, las conversaciones fluyen y se alargan; cuando hay tensión, aparecen respuestas más frías o silencios.

Hablar explícitamente de expectativas de comunicación (cada cuánto hablar, cómo expresar molestias, etc.) puede evitar muchos malentendidos.`
        },
        {
          id: 'emocion',
          title: 'Patrones emocionales',
          body:
`Se observan momentos de ansiedad, especialmente cuando una de las partes siente que la otra se distancia, responde menos o cambia el tono. 
En esos momentos aparecen preguntas como “¿estás bien?” o intentos de aclarar lo que pasó.

También hay muestras claras de cariño: apodos, mensajes de buenos días o buenas noches, y preocupación genuina por el estado emocional del otro. 
Esto es un indicador fuerte de apego, incluso cuando hay discusiones.

Trabajar en regular la intensidad emocional (no responder en caliente, dar espacio sin castigar con silencios eternos) puede ayudar mucho a que la relación sea más estable.`
        }
      ],
      rawAnalysis:
`Este es un análisis de ejemplo generado sin IA real, solo para comprobar que la interfaz funciona correctamente.

En un reporte real, aquí tendrías un análisis profundo de tu relación: estilos de apego, forma de discutir, lenguaje afectivo, señales de dependencia emocional, patrones de evitación, etc.

Una vez que conectes tu API key y tengas créditos disponibles en OpenAI, este texto será reemplazado por un análisis específico de tu conversación.`,
      fullChat: text
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error en /api/analyze:', err);
    return NextResponse.json(
      {
        error:
          err?.message ??
          'Ocurrió un error inesperado al generar el reporte.',
      },
      { status: 500 }
    );
  }
}
