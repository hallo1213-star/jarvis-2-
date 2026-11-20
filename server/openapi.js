// OpenAPI 3.1 schema for a ChatGPT "Custom GPT" Action (and any other client).
import { config } from './config.js'
import { MODELS } from './models.js'

export function openapi(req) {
  const origin = config.publicUrl || `http://${req.headers.host}`
  return {
    openapi: '3.1.0',
    info: {
      title: 'AURIX Video Studio',
      version: '1.0.0',
      description: 'Submit AI video generation orders. Paid generations are NEVER started by this API alone – the owner must confirm the price in the AURIX app first.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/video/jobs': {
        post: {
          operationId: 'createVideoJob',
          summary: 'Submit a video order (concept + generation prompt(s)). Returns the job and its estimated cost; the owner confirms it in the app.',
          'x-openai-isConsequential': false,
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/VideoOrder' } } } },
          responses: { 201: { description: 'Job created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } } },
        },
        get: {
          operationId: 'listVideoJobs',
          summary: 'List recent video jobs with status and progress.',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
          responses: { 200: { description: 'Jobs', content: { 'application/json': { schema: { type: 'object', properties: { jobs: { type: 'array', items: { $ref: '#/components/schemas/Job' } } } } } } } },
        },
      },
      '/api/video/jobs/{id}': {
        get: {
          operationId: 'getVideoJob',
          summary: 'Get status, progress and (when completed) the video URL of a job.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Job', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } } },
        },
      },
      '/api/video/models': {
        get: {
          operationId: 'listVideoModels',
          summary: 'List available video models, their supported durations/aspect ratios/resolutions and price per second.',
          responses: { 200: { description: 'Models', content: { 'application/json': { schema: { type: 'object', properties: { models: { type: 'array', items: { type: 'object' } } } } } } } },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        VideoOrder: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'Short title of the video' },
            concept: { type: 'string', description: 'Full video concept (story, mood, style, shot list) for the owner to review' },
            prompt: { type: 'string', description: 'Detailed generation prompt for a single-shot video (English works best). Describe subject, action, setting, lighting, camera movement, lens, style. Use either prompt or scenes.' },
            scenes: {
              type: 'array', maxItems: 8,
              description: 'Multi-shot video: each scene is generated as its own AI clip and the clips are joined into one film.',
              items: { type: 'object', required: ['prompt'], properties: { title: { type: 'string' }, prompt: { type: 'string' }, duration: { type: 'number' }, negative_prompt: { type: 'string' } } },
            },
            negative_prompt: { type: 'string', description: 'Things to avoid, e.g. "blurry, distorted faces, text, watermark"' },
            quality: { type: 'string', enum: ['test', 'cheap', 'standard', 'premium'], description: 'Picks a model tier. test = free pipeline check without AI.' },
            model: { type: 'string', enum: MODELS.map((m) => m.id), description: 'Explicit model id (overrides quality)' },
            duration: { type: 'number', description: 'Seconds per clip (snapped to what the model supports, typically 5–10)' },
            aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: '9:16 for TikTok/Reels/Shorts, 16:9 for YouTube' },
            resolution: { type: 'string', enum: ['480p', '720p', '1080p', '1440p', '2160p'] },
            audio: { type: 'boolean', description: 'Generate sound if the model supports it' },
            image_url: { type: 'string', description: 'Optional public https image URL for image-to-video (first scene starts from this image)' },
          },
        },
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string' }, title: { type: 'string' },
            status: { type: 'string', enum: ['awaiting_confirmation', 'queued', 'generating', 'finalizing', 'completed', 'failed', 'cancelled', 'rejected'] },
            message: { type: 'string' }, progress: { type: 'number' }, estimate_usd: { type: 'number' }, modelName: { type: 'string' },
            app_url: { type: 'string', description: 'Link to open the job in the AURIX app' },
            video: { type: ['object', 'null'], properties: { url: { type: 'string' }, poster: { type: ['string', 'null'] } } },
            error: { type: ['string', 'null'] },
          },
        },
      },
    },
    security: [{ bearer: [] }],
  }
}
