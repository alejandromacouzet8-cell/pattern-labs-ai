import { NextRequest, NextResponse } from 'next/server';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const { audioUrl, text, backgroundImage } = await request.json();

    if (!audioUrl || !text) {
      return NextResponse.json(
        { error: 'audioUrl y text son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el archivo de audio existe
    const audioPath = join(process.cwd(), 'public', audioUrl);
    if (!existsSync(audioPath)) {
      return NextResponse.json(
        { error: 'Archivo de audio no encontrado' },
        { status: 404 }
      );
    }

    // Crear directorio de salida si no existe
    const outputDir = join(process.cwd(), 'public', 'videos');
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Bundle el proyecto de Remotion
    const bundleLocation = await bundle({
      entryPoint: join(process.cwd(), 'remotion', 'index.ts'),
      webpackOverride: (config) => config,
    });

    // Seleccionar la composición
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'VoiceVideo',
      inputProps: {
        audioUrl: `http://localhost:3000${audioUrl}`,
        text,
        backgroundImage: backgroundImage || '',
      },
    });

    // Generar nombre único para el video
    const timestamp = Date.now();
    const videoFilename = `video_${timestamp}.mp4`;
    const outputPath = join(outputDir, videoFilename);

    // Renderizar el video
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: {
        audioUrl: `http://localhost:3000${audioUrl}`,
        text,
        backgroundImage: backgroundImage || '',
      },
    });

    return NextResponse.json({
      success: true,
      videoUrl: `/videos/${videoFilename}`,
      message: 'Video renderizado exitosamente',
    });
  } catch (error: any) {
    console.error('Error rendering video:', error);
    return NextResponse.json(
      { error: 'Error al renderizar video', details: error.message },
      { status: 500 }
    );
  }
}
