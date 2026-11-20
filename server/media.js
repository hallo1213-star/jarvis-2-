// ffmpeg helpers: availability check, poster frames, scene concatenation.
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { rename, unlink, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

let ff
export const ffmpegAvailable = () => {
  if (ff === undefined) ff = spawnSync('ffmpeg', ['-version']).status === 0
  return ff
}

export function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args)
    let err = ''
    p.stderr.on('data', (c) => { err += c })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${err.slice(-400)}`))))
  })
}

export async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status})`)
  const tmp = dest + '.part'
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  await rename(tmp, dest)
  return (await stat(dest)).size
}

export async function poster(video, out) {
  if (!ffmpegAvailable()) return false
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', out])
    return true
  } catch { return false }
}

export async function probeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  const d = parseFloat(String(r.stdout))
  return Number.isFinite(d) ? d : null
}

// Join scene clips into one film. Re-encodes so clips with slightly different
// parameters still join cleanly; keeps audio if every clip has an audio track.
export async function concatClips(files, out, { width, height }) {
  const hasAudio = files.every((f) => {
    const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f])
    return String(r.stdout).trim().length > 0
  })
  const inputs = files.flatMap((f) => ['-i', f])
  const norm = files.map((_, i) => `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p[v${i}]` +
    (hasAudio ? `;[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]` : '')).join(';')
  const chain = files.map((_, i) => `[v${i}]` + (hasAudio ? `[a${i}]` : '')).join('')
  const fc = `${norm};${chain}concat=n=${files.length}:v=1:a=${hasAudio ? 1 : 0}[v]${hasAudio ? '[a]' : ''}`
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[v]', ...(hasAudio ? ['-map', '[a]', '-c:a', 'aac'] : []),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
}

export async function videoSize(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
  const [w, h] = String(r.stdout).trim().split(',').map(Number)
  return w && h ? { width: w, height: h } : null
}

export const safeUnlink = (f) => unlink(f).catch(() => {})
