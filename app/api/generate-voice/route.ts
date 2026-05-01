import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId = 'pNInz6obpgDQGcFmaJgB' } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'El texto es requerido' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY no configurada' },
        { status: 500 }
      );
    }

    // Llamar a ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      return NextResponse.json(
        { error: 'Error al generar audio', details: errorText },
        { status: response.status }
      );
    }

    // Leer el audio como buffer
    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);

    // Crear directorio si no existe
    const audioDir = join(process.cwd(), 'public', 'audio');
    if (!existsSync(audioDir)) {
      await mkdir(audioDir, { recursive: true });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const filename = `voice_${timestamp}.mp3`;
    const filepath = join(audioDir, filename);

    // Guardar el archivo
    await writeFile(filepath, buffer);

    // Obtener duración del audio (aproximada basada en tamaño)
    // Para una estimación más precisa, podrías usar una librería como music-metadata
    const durationEstimate = Math.ceil(text.length / 14); // ~14 caracteres por segundo

    return NextResponse.json({
      success: true,
      audioUrl: `/audio/${filename}`,
      filename,
      duration: durationEstimate,
      message: 'Audio generado exitosamente',
    });
  } catch (error: any) {
    console.error('Error generating voice:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}
