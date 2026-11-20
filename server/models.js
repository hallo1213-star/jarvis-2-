// Model registry. Prices are ESTIMATES (USD) taken from public provider pricing in
// late 2026 – always check the provider's pricing page. Each model declares what it
// supports so the UI only offers valid combinations, and `build()` maps the generic
// job settings onto the provider's own input parameters.
//
// To add a model: copy an entry, set the provider endpoint ids, and adjust build().

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback)
const nearest = (v, allowed) => allowed.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))

export const MODELS = [
  // ---------------------------------------------------------------- free test mode
  {
    id: 'demo-motion',
    provider: 'demo',
    name: 'Test-Modus (kostenlos, keine KI)',
    tier: 'test',
    description: 'Prüft die komplette Pipeline (Auftrag → Fortschritt → Speichern → Vorschau) ohne Kosten. Erzeugt lokal mit ffmpeg eine animierte Testsequenz – KEIN KI-Video.',
    modes: ['t2v', 'i2v'],
    durations: [4, 6, 8],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: false,
    pricePerSecond: () => 0,
    expectedSeconds: 8,
  },
  // ---------------------------------------------------------------- fal.ai
  {
    id: 'ltx-2-fast',
    provider: 'fal',
    name: 'LTX-2 Fast',
    tier: 'günstig',
    description: 'Sehr günstig und schnell, echte Bewegung, bis 4K. Gut für Entwürfe und Social Clips.',
    endpoints: { t2v: 'fal-ai/ltx-2/text-to-video/fast', i2v: 'fal-ai/ltx-2/image-to-video/fast' },
    modes: ['t2v', 'i2v'],
    durations: [6, 8, 10],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['1080p', '1440p', '2160p'],
    audio: true,
    pricePerSecond: ({ resolution }) => ({ '1080p': 0.04, '1440p': 0.08, '2160p': 0.16 }[resolution] ?? 0.04),
    expectedSeconds: 60,
    build: (s) => ({
      prompt: s.prompt,
      duration: nearest(s.duration, [6, 8, 10]),
      resolution: pick(s.resolution, ['1080p', '1440p', '2160p'], '1080p'),
      aspect_ratio: pick(s.aspect_ratio, ['16:9', '9:16'], '16:9'),
      fps: 25,
      generate_audio: Boolean(s.audio),
      ...(s.image_url ? { image_url: s.image_url } : {}),
    }),
  },
  {
    id: 'wan-2.5',
    provider: 'fal',
    name: 'Wan 2.5',
    tier: 'günstig',
    description: 'Open-Source-Modell von Alibaba, gutes Preis-Leistungs-Verhältnis, natürliche Bewegungen.',
    endpoints: { t2v: 'fal-ai/wan-25-preview/text-to-video', i2v: 'fal-ai/wan-25-preview/image-to-video' },
    modes: ['t2v', 'i2v'],
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: false,
    pricePerSecond: ({ resolution }) => ({ '480p': 0.05, '720p': 0.1, '1080p': 0.15 }[resolution] ?? 0.1),
    expectedSeconds: 120,
    build: (s) => ({
      prompt: s.prompt,
      ...(s.negative_prompt ? { negative_prompt: s.negative_prompt } : {}),
      duration: String(nearest(s.duration, [5, 10])),
      resolution: pick(s.resolution, ['480p', '720p', '1080p'], '720p'),
      ...(s.image_url ? { image_url: s.image_url } : { aspect_ratio: pick(s.aspect_ratio, ['16:9', '9:16', '1:1'], '16:9') }),
    }),
  },
  {
    id: 'kling-2.5-turbo-pro',
    provider: 'fal',
    name: 'Kling 2.5 Turbo Pro',
    tier: 'standard',
    description: 'Sehr realistische Menschen, Autos und Kamerafahrten. Bester Allrounder für TikTok & YouTube.',
    endpoints: { t2v: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video', i2v: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' },
    modes: ['t2v', 'i2v'],
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['1080p'],
    audio: false,
    pricePerSecond: () => 0.07,
    expectedSeconds: 150,
    build: (s) => ({
      prompt: s.prompt,
      ...(s.negative_prompt ? { negative_prompt: s.negative_prompt } : {}),
      duration: String(nearest(s.duration, [5, 10])),
      aspect_ratio: pick(s.aspect_ratio, ['16:9', '9:16', '1:1'], '16:9'),
      ...(s.image_url ? { image_url: s.image_url } : {}),
    }),
  },
  {
    id: 'veo-3.1-fast',
    provider: 'fal',
    name: 'Google Veo 3.1 Fast',
    tier: 'premium',
    description: 'Kinoqualität mit Ton (Geräusche, Musik, Sprache). Teurer – für finale Videos.',
    endpoints: { t2v: 'fal-ai/veo3.1/fast', i2v: 'fal-ai/veo3.1/fast/image-to-video' },
    modes: ['t2v', 'i2v'],
    durations: [4, 6, 8],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p'],
    audio: true,
    pricePerSecond: ({ audio }) => (audio ? 0.15 : 0.1),
    expectedSeconds: 90,
    build: (s) => ({
      prompt: s.prompt,
      ...(s.negative_prompt ? { negative_prompt: s.negative_prompt } : {}),
      duration: `${nearest(s.duration, [4, 6, 8])}s`,
      aspect_ratio: pick(s.aspect_ratio, ['16:9', '9:16'], '16:9'),
      resolution: pick(s.resolution, ['720p', '1080p'], '720p'),
      generate_audio: Boolean(s.audio),
      ...(s.image_url ? { image_url: s.image_url } : {}),
    }),
  },
  // ---------------------------------------------------------------- Replicate
  {
    id: 'replicate-wan-2.2-fast',
    provider: 'replicate',
    name: 'Wan 2.2 Fast (Replicate)',
    tier: 'günstig',
    description: 'Alternative über Replicate, falls du dort bereits ein Konto hast.',
    endpoints: { t2v: 'wan-video/wan-2.2-t2v-fast', i2v: 'wan-video/wan-2.2-i2v-fast' },
    modes: ['t2v', 'i2v'],
    durations: [5],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['480p', '720p'],
    audio: false,
    pricePerSecond: ({ resolution }) => (resolution === '720p' ? 0.03 : 0.015),
    expectedSeconds: 60,
    build: (s) => ({
      prompt: s.prompt,
      resolution: pick(s.resolution, ['480p', '720p'], '480p'),
      ...(s.image_url ? { image: s.image_url } : { aspect_ratio: pick(s.aspect_ratio, ['16:9', '9:16'], '16:9') }),
    }),
  },
]

export const getModel = (id) => MODELS.find((m) => m.id === id)

// Normalise user/ChatGPT settings against what the model supports.
export function normaliseSettings(model, s = {}) {
  const duration = nearest(Number(s.duration) || model.durations[0], model.durations)
  const aspect_ratio = pick(s.aspect_ratio, model.aspectRatios, model.aspectRatios[0])
  const resolution = pick(s.resolution, model.resolutions, model.defaultResolution || model.resolutions[0])
  return { duration, aspect_ratio, resolution, audio: model.audio ? Boolean(s.audio) : false }
}

export const sceneCost = (model, settings) => +(model.pricePerSecond(settings) * settings.duration).toFixed(3)
