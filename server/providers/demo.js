// Free local TEST mode. Renders an animated test sequence with ffmpeg so the whole
// pipeline (job → progress → storage → preview/download) can be verified at zero cost.
// This is deliberately labelled in the UI as "no AI" – it is not a substitute for a
// real generation model.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dirs } from '../config.js'
import { ffmpegAvailable } from '../media.js'

const runs = new Map()
const SIZES = {
  '16:9': { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080] },
  '9:16': { '480p': [480, 854], '720p': [720, 1280], '1080p': [1080, 1920] },
  '1:1': { '480p': [480, 480], '720p': [720, 720], '1080p': [1080, 1080] },
}

export const demo = {
  id: 'demo',
  name: 'Test-Modus',
  configured: () => ffmpegAvailable(),
  keyHint: 'Kein Schlüssel nötig – benötigt ffmpeg auf dem Server',
  local: true,

  async submit({ input }) {
    const id = randomUUID()
    const [w, h] = SIZES[input.aspect_ratio]?.[input.resolution] || [1280, 720]
    const d = input.duration || 4
    const file = join(dirs.tmp, `demo-${id}.mp4`)
    // Moving colour field + slowly zooming fractal layer = obvious motion, clearly synthetic.
    const vf = [
      `[0:v]format=yuv420p,hue=H=t*0.6[a]`,
      `[1:v]scale=${w}:${h},format=yuv420p,zoompan=z='min(zoom+0.0025,1.6)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}[b]`,
      `[a][b]blend=all_mode=overlay:all_opacity=0.55,drawbox=x=0:y=ih-ih/7:w=iw:h=ih/7:color=black@0.45:t=fill[v]`,
    ].join(';')
    const args = ['-y', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `gradients=s=${w}x${h}:c0=0x1a0b3d:c1=0x8b5cf6:c2=0x0b1020:c3=0xc4b5fd:speed=0.02:d=${d}:r=25`,
      '-f', 'lavfi', '-i', `mandelbrot=s=${Math.round(w / 2)}x${Math.round(h / 2)}:r=25`,
      '-filter_complex', vf, '-map', '[v]', '-t', String(d), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]
    const run = { state: 'running', file, error: null }
    runs.set(id, run)
    const p = spawn('ffmpeg', args)
    let err = ''
    p.stderr.on('data', (c) => { err += c })
    p.on('close', (code) => {
      if (code === 0) run.state = 'done'
      else { run.state = 'failed'; run.error = 'ffmpeg: ' + err.slice(-300) }
    })
    run.proc = p
    return { id }
  },

  async poll(ref) {
    const r = runs.get(ref.id)
    if (!r) return { state: 'failed', error: 'Testlauf nicht mehr vorhanden (Server neu gestartet?)' }
    if (r.state === 'done') return { state: 'done', localFile: r.file }
    if (r.state === 'failed') return { state: 'failed', error: r.error }
    return { state: 'running' }
  },

  async cancel(ref) {
    runs.get(ref?.id)?.proc?.kill('SIGKILL')
  },
}
