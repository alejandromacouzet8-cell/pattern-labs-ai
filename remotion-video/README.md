# Pattern Labs AI - Remotion Videos

Videos animados para Instagram Reels, TikTok y YouTube Shorts.

## 🎬 Videos Disponibles

### 1. **PatternScoreReveal** (15 segundos)
POV: La IA analizó mi chat y reveló el Pattern Score de forma dramática.

**Fases:**
- Hook inicial: "POV: La IA analizó mi chat..."
- Analizando con barra de progreso
- Reveal del Pattern Score (animado de 0 a 23)
- Detalles: Reciprocidad, Balance, Red flags
- CTA: patternlabsai.com

### 2. **RedFlagsVideo** (25 segundos)
3 señales que la IA detecta en chats que terminan mal.

**Fases:**
- Hook: "Analicé 1,000 chats..."
- Red Flag #1: Asimetría en mensajes
- Red Flag #2: Respuestas monosílabas
- Red Flag #3: Tiempo de respuesta desigual
- CTA final

## 🚀 Comandos

### Ver preview en tiempo real:
```bash
npm start
```
Abre un navegador con preview interactivo donde puedes:
- Ver todos los videos
- Ajustar frame por frame
- Cambiar propiedades en vivo
- Exportar directamente

### Renderizar videos:

```bash
# Renderizar PatternScoreReveal
npm run build

# Renderizar RedFlagsVideo
npm run build:redflags

# Renderizar ambos
npm run render:all
```

Los videos se guardan en la carpeta `out/`

## 🎨 Personalizar

Edita los valores en [src/Root.tsx](src/Root.tsx):

```tsx
<Composition
  id="PatternScoreReveal"
  component={PatternScoreReveal}
  defaultProps={{
    score: 23,  // ← Cambia el score aquí (0-100)
    title: 'POV: La IA analizó mi chat...', // ← Cambia el texto
  }}
/>
```

## 📐 Formato de los videos

- **Resolución:** 1080x1920 (9:16 vertical para Instagram/TikTok)
- **FPS:** 30
- **Duración:**
  - PatternScoreReveal: 15 segundos
  - RedFlagsVideo: 25 segundos

## 🎨 Crear nuevos videos

1. Crea un nuevo archivo en `src/` (ej: `MiVideo.tsx`)
2. Usa los hooks de Remotion:
   - `useCurrentFrame()` - Frame actual
   - `interpolate()` - Animar valores
   - `spring()` - Animaciones suaves
3. Registra en `Root.tsx`:

```tsx
<Composition
  id="MiVideo"
  component={MiVideo}
  durationInFrames={450} // 15 seg a 30fps
  fps={30}
  width={1080}
  height={1920}
/>
```

## 💡 Tips para viralidad

1. **Hook en primeros 3 frames** (0.1 seg) - texto impactante
2. **Animaciones suaves** - usa `spring()` en lugar de linear
3. **Colores contrastantes** - verde (#10b981), rojo (#ef4444)
4. **Texto grande** - mínimo 40px para mobile
5. **CTA claro al final** - siempre incluir patternlabsai.com

## 🎥 Workflow recomendado

1. `npm start` - Abre el preview
2. Ajusta animaciones en vivo
3. Cuando esté listo: `npm run build`
4. Sube a Instagram/TikTok

## 📦 Archivos incluidos

```
remotion-video/
├── src/
│   ├── Root.tsx              # Composiciones principales
│   ├── PatternScoreReveal.tsx # Video 1: POV Score Reveal
│   ├── RedFlagsVideo.tsx     # Video 2: 3 Red Flags
│   └── index.ts              # Entry point
├── out/                      # Videos renderizados (gitignored)
├── package.json
├── tsconfig.json
└── remotion.config.ts
```

## 🔥 Próximos videos a crear

- [ ] "Antes vs. Después del análisis"
- [ ] "¿Quién está más enganchado?" reveal
- [ ] "La IA me dijo algo que nadie se atrevía"
- [ ] Carousel de "5 señales que todos ignoran"

## 🐛 Troubleshooting

**Error: Module not found**
```bash
npm install
```

**Video no se renderiza**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Preview muy lento**
- Cierra otras apps
- Reduce la calidad en el preview
- Usa Chrome (mejor performance)
