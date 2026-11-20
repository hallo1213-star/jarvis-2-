import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard, ImagePlus, Type, Smartphone, Monitor, Square, Volume2, VolumeX, Download, Trash2, Check, X,
  LoaderCircle, Server, Bot, Copy, CircleAlert, Clock, Sparkles, Plus, Play, CircleStop, Layers, ChevronDown,
} from 'lucide-react'
import { useRouter } from '../router.jsx'
import { toast } from '../store/toast.js'
import { Confirm, PageHeader, Section, Sheet } from '../components/ui.jsx'
import { fmtUsd, getServerConfig, imageToDataUrl, mediaUrl, setServerConfig, videoApi } from '../data/videoApi.js'

const FORMATS = [
  { id: '9:16', label: '9:16', hint: 'TikTok · Reels', icon: Smartphone },
  { id: '16:9', label: '16:9', hint: 'YouTube', icon: Monitor },
  { id: '1:1', label: '1:1', hint: 'Feed', icon: Square },
]
const TIER_LABEL = { test: 'Test', günstig: 'Günstig', standard: 'Standard', premium: 'Premium' }
const STATUS = {
  awaiting_confirmation: 'Wartet auf Bestätigung', queued: 'In Warteschlange', generating: 'Wird generiert',
  finalizing: 'Wird fertiggestellt', completed: 'Fertig', failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen', rejected: 'Abgelehnt',
}
const ACTIVE = ['queued', 'generating', 'finalizing']
const SOURCE = { chatgpt: 'ChatGPT', app: 'App', cli: 'Claude Code' }
const ratioClass = (r) => (r === '9:16' ? 'r916' : r === '1:1' ? 'r11' : 'r169')
const fmtDate = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ------------------------------------------------------------------ data hook
function useStudio() {
  const [health, setHealth] = useState(null)
  const [models, setModels] = useState([])
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    Promise.all([videoApi.health(), videoApi.models()])
      .then(([h, m]) => { if (alive) { setHealth(h); setModels(m); setError(null) } })
      .catch((e) => alive && setError(e))
    return () => { alive = false }
  }, [tick])

  const busy = jobs.some((j) => ACTIVE.includes(j.status))
  useEffect(() => {
    let alive = true
    let timer
    const load = () => videoApi.jobs()
      .then((j) => { if (alive) { setJobs(j); setError(null) } })
      .catch((e) => alive && setError(e))
      .finally(() => { if (alive) timer = setTimeout(load, busy ? 2000 : 8000) })
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [busy, tick])

  const patchJob = (j) => setJobs((xs) => (xs.some((x) => x.id === j.id) ? xs.map((x) => (x.id === j.id ? j : x)) : [j, ...xs]))
  return { health, models, jobs, error, refresh, patchJob, removeJob: (id) => setJobs((xs) => xs.filter((x) => x.id !== id)) }
}

// ------------------------------------------------------------------ page
export default function VideoStudio({ jobId }) {
  const studio = useStudio()
  const { navigate } = useRouter()
  const [confirmJob, setConfirmJob] = useState(null)
  const [openId, setOpenId] = useState(jobId || null)
  const [serverOpen, setServerOpen] = useState(false)

  useEffect(() => { if (jobId) setOpenId(jobId) }, [jobId])
  const opened = studio.jobs.find((j) => j.id === openId)
  // Deep link from ChatGPT (#/studio/<id>): open confirmation directly
  useEffect(() => {
    if (opened?.status === 'awaiting_confirmation' && jobId === opened.id) { setConfirmJob(opened); setOpenId(null) }
  }, [opened, jobId])

  const pending = studio.jobs.filter((j) => j.status === 'awaiting_confirmation')
  const active = studio.jobs.filter((j) => ACTIVE.includes(j.status))
  const done = studio.jobs.filter((j) => j.status === 'completed')
  const failed = studio.jobs.filter((j) => ['failed', 'cancelled'].includes(j.status)).slice(0, 6)
  const offline = studio.error?.offline || studio.error?.status === 401

  return (
    <div className="page studio">
      <PageHeader
        title="Video Studio"
        back="/"
        subtitle="Echte KI-Videosequenzen aus Text oder Bild – mit ChatGPT als Regisseur."
        right={<button className={`studio-conn ${studio.health ? 'ok' : 'off'}`} onClick={() => setServerOpen(true)} aria-label="Server-Verbindung">
          <Server size={16} /><span>{studio.health ? 'Verbunden' : 'Offline'}</span>
        </button>}
      />

      {offline && (
        <div className="studio-alert">
          <CircleAlert size={20} />
          <div>
            <strong>{studio.error.status === 401 ? 'Zugriff verweigert' : 'Video-Server nicht erreichbar'}</strong>
            <p>{studio.error.status === 401 ? 'Trage dein App-Token (VIDEO_APP_TOKEN) in den Server-Einstellungen ein.' : 'Starte ihn mit „npm run server“ oder trage seine Adresse ein.'}</p>
          </div>
          <button className="btn secondary small-btn" onClick={() => setServerOpen(true)}>Einrichten</button>
        </div>
      )}

      {studio.health && !studio.health.providers.some((p) => p.configured && p.id !== 'demo') && (
        <div className="studio-alert soft">
          <Sparkles size={20} />
          <div>
            <strong>Nur Test-Modus aktiv</strong>
            <p>Für echte KI-Videos <code>FAL_KEY</code> in die Datei <code>.env</code> im Projektordner eintragen und den Server neu starten.</p>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <Section title="Wartet auf deine Bestätigung">
          <div className="studio-list">
            {pending.map((j) => <PendingCard key={j.id} job={j} onReview={() => setConfirmJob(j)} />)}
          </div>
        </Section>
      )}

      {active.length > 0 && (
        <Section title="Wird generiert">
          <div className="studio-list">
            {active.map((j) => <ProgressCard key={j.id} job={j} onCancel={async () => {
              try { studio.patchJob(await videoApi.cancel(j.id)); toast('Abgebrochen') } catch (e) { toast(e.message) }
            }} />)}
          </div>
        </Section>
      )}

      <Composer studio={studio} disabled={!studio.health} onCreated={(j) => {
        studio.patchJob(j)
        if (j.status === 'awaiting_confirmation') setConfirmJob(j)
        else toast('Testlauf gestartet')
      }} />

      <Section title="Meine Videos" action={done.length > 0 && <span className="muted small-text">{done.length}</span>}>
        {done.length ? (
          <div className="video-grid">
            {done.map((j) => <VideoCard key={j.id} job={j} onOpen={() => setOpenId(j.id)} />)}
          </div>
        ) : (
          <div className="studio-empty">
            <Clapperboard size={28} />
            <p>Noch keine Videos. Beschreibe oben deine Idee – oder sag ChatGPT: <em>„Erstelle mir ein Video über …“</em></p>
          </div>
        )}
      </Section>

      {failed.length > 0 && (
        <Section title="Nicht abgeschlossen">
          <div className="studio-list">
            {failed.map((j) => (
              <div key={j.id} className="job-card muted-card">
                <div className="job-head">
                  <div><h3>{j.title}</h3><p className="muted small-text">{STATUS[j.status]} · {fmtDate(j.updatedAt)}</p></div>
                  <button className="icon-btn ghost small" aria-label="Entfernen" onClick={async () => {
                    try { await videoApi.remove(j.id); studio.removeJob(j.id) } catch (e) { toast(e.message) }
                  }}><Trash2 size={18} /></button>
                </div>
                {j.error && <p className="job-error">{j.error}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <ChatGPTInfo health={studio.health} />

      <ConfirmSheet job={confirmJob} health={studio.health} onClose={() => { setConfirmJob(null); if (jobId) navigate('/studio', { replace: true }) }}
        onDone={(j) => { studio.patchJob(j); setConfirmJob(null) }} />
      <VideoSheet job={opened?.status === 'completed' ? opened : null} onClose={() => { setOpenId(null); if (jobId) navigate('/studio', { replace: true }) }}
        onDeleted={(id) => { studio.removeJob(id); setOpenId(null) }} />
      <ServerSheet open={serverOpen} onClose={() => setServerOpen(false)} health={studio.health} onSaved={studio.refresh} />
    </div>
  )
}

// ------------------------------------------------------------------ composer
function Composer({ studio, onCreated, disabled }) {
  const { models } = studio
  const [mode, setMode] = useState('t2v')
  const [multi, setMulti] = useState(false)
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [scenes, setScenes] = useState([{ prompt: '' }, { prompt: '' }])
  const [image, setImage] = useState(null)
  const [aspect, setAspect] = useState('9:16')
  const [modelId, setModelId] = useState('')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('')
  const [audio, setAudio] = useState(false)
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const usable = models.filter((m) => m.modes.includes(mode))
  const model = usable.find((m) => m.id === modelId) || usable.find((m) => m.available && m.tier !== 'test') || usable.find((m) => m.available) || usable[0]
  useEffect(() => {
    if (!model) return
    if (!model.resolutions.includes(resolution)) setResolution(model.defaultResolution)
    if (!model.durations.includes(duration)) setDuration(model.durations[0])
    if (!model.aspectRatios.includes(aspect)) setAspect(model.aspectRatios[0])
  }, [model?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => ({
    title: title.trim(),
    model: model?.id,
    aspect_ratio: aspect, duration, resolution, audio,
    ...(multi ? { scenes: scenes.map((s) => ({ prompt: s.prompt.trim() })) } : { prompt: prompt.trim() }),
  }), [title, model?.id, aspect, duration, resolution, audio, multi, scenes, prompt])

  useEffect(() => {
    if (!model || disabled) return
    const t = setTimeout(() => {
      videoApi.quote({ ...order, with_image: mode === 'i2v' }).then(setQuote).catch(() => setQuote(null))
    }, 250)
    return () => clearTimeout(t)
  }, [order, mode, model, disabled])

  const ready = !disabled && model?.available && (multi ? scenes.every((s) => s.prompt.trim()) : prompt.trim()) && (mode === 't2v' || image)

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const job = await videoApi.create({ ...order, ...(mode === 'i2v' ? { image_base64: image } : {}) })
      onCreated(job)
      setPrompt(''); setTitle(''); setScenes([{ prompt: '' }, { prompt: '' }]); setImage(null)
    } catch (err) { toast(err.message) } finally { setBusy(false) }
  }

  return (
    <Section title="Neues Video">
      <form className="composer" onSubmit={submit}>
        <div className="segmented two">
          <button type="button" className={mode === 't2v' ? 'on' : ''} onClick={() => setMode('t2v')}><Type size={16} /> Text → Video</button>
          <button type="button" className={mode === 'i2v' ? 'on' : ''} onClick={() => setMode('i2v')}><ImagePlus size={16} /> Bild → Video</button>
        </div>

        <label className="field">
          <span>Titel (optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="z. B. Sportwagen an der Küste" />
        </label>

        {mode === 'i2v' && (
          <div className="image-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}>
            {image ? <img src={image} alt="Startbild" /> : <><ImagePlus size={26} /><span>Startbild wählen – die KI animiert es</span></>}
            {image && <button type="button" className="icon-btn small image-clear" aria-label="Bild entfernen" onClick={(e) => { e.stopPropagation(); setImage(null) }}><X size={16} /></button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) try { setImage(await imageToDataUrl(f)) } catch (err) { toast(err.message) }
            }} />
          </div>
        )}

        <div className="scene-toggle">
          <button type="button" className={`chip ${!multi ? 'on' : ''}`} onClick={() => setMulti(false)}>Eine Einstellung</button>
          <button type="button" className={`chip ${multi ? 'on' : ''}`} onClick={() => setMulti(true)}><Layers size={15} /> Mehrere Szenen</button>
        </div>

        {multi ? (
          <div className="scene-list">
            {scenes.map((s, i) => (
              <label key={i} className="field">
                <span>Szene {i + 1}{i === 0 && mode === 'i2v' ? ' (startet mit deinem Bild)' : ''}</span>
                <div className="scene-row">
                  <textarea rows={3} value={s.prompt} placeholder="Was passiert in dieser Einstellung? Motiv, Bewegung, Kamera, Licht …"
                    onChange={(e) => setScenes((xs) => xs.map((x, k) => (k === i ? { prompt: e.target.value } : x)))} />
                  {scenes.length > 1 && <button type="button" className="icon-btn ghost small" aria-label="Szene entfernen" onClick={() => setScenes((xs) => xs.filter((_, k) => k !== i))}><X size={18} /></button>}
                </div>
              </label>
            ))}
            {scenes.length < 8 && <button type="button" className="btn outline" onClick={() => setScenes((xs) => [...xs, { prompt: '' }])}><Plus size={16} /> Szene hinzufügen</button>}
          </div>
        ) : (
          <label className="field">
            <span>Beschreibung / Generierungs-Prompt</span>
            <textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="z. B. Cinematic drone shot: a red sports car races along a cliffside coastal road at golden hour, waves crashing below, camera slowly orbits the car, photorealistic, 35mm film look" />
          </label>
        )}

        <div className="opt-block">
          <span className="opt-label">Format</span>
          <div className="format-row">
            {FORMATS.map(({ id, label, hint, icon: Icon }) => (
              <button type="button" key={id} disabled={model && !model.aspectRatios.includes(id)}
                className={`format-btn ${aspect === id ? 'on' : ''}`} onClick={() => setAspect(id)}>
                <span className={`format-shape ${ratioClass(id)}`}><Icon size={16} /></span>
                <strong>{label}</strong><small>{hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="opt-block">
          <span className="opt-label">Modell</span>
          <div className="model-list">
            {usable.map((m) => (
              <button type="button" key={m.id} className={`model-card ${model?.id === m.id ? 'on' : ''} ${m.available ? '' : 'locked'}`}
                onClick={() => setModelId(m.id)}>
                <div className="model-top">
                  <strong>{m.name}</strong>
                  <span className={`tier t-${m.tier === 'günstig' ? 'cheap' : m.tier}`}>{TIER_LABEL[m.tier] || m.tier}</span>
                </div>
                <p>{m.description}</p>
                <small>{m.available ? `${m.providerName} · ab ${fmtUsd(Math.min(...Object.values(m.priceExamples)))}/s` : `Nicht eingerichtet – ${m.keyHint}`}</small>
              </button>
            ))}
          </div>
        </div>

        {model && (
          <div className="opt-grid">
            <div className="opt-block">
              <span className="opt-label">Dauer {multi ? 'je Szene' : ''}</span>
              <div className="chip-cloud">
                {model.durations.map((d) => <button type="button" key={d} className={`chip ${duration === d ? 'on' : ''}`} onClick={() => setDuration(d)}>{d} s</button>)}
              </div>
            </div>
            <div className="opt-block">
              <span className="opt-label">Qualität / Auflösung</span>
              <div className="chip-cloud">
                {model.resolutions.map((r) => <button type="button" key={r} className={`chip ${resolution === r ? 'on' : ''}`} onClick={() => setResolution(r)}>{r === '2160p' ? '4K' : r}</button>)}
              </div>
            </div>
            {model.audio && (
              <div className="opt-block">
                <span className="opt-label">Ton</span>
                <div className="chip-cloud">
                  <button type="button" className={`chip ${audio ? 'on' : ''}`} onClick={() => setAudio(true)}><Volume2 size={15} /> Mit Ton</button>
                  <button type="button" className={`chip ${!audio ? 'on' : ''}`} onClick={() => setAudio(false)}><VolumeX size={15} /> Stumm</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="composer-foot">
          <div className="cost">
            <span className="muted small-text">Geschätzte Kosten</span>
            <strong>{quote ? fmtUsd(quote.estimate_usd) : '–'}</strong>
            {quote && <span className="muted small-text">{quote.scenes.reduce((s, x) => s + x.duration, 0)} s Video · {quote.modelName}</span>}
          </div>
          <button className="btn primary" type="submit" disabled={!ready || busy}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
            {quote?.estimate_usd === 0 ? 'Testlauf starten' : 'Weiter zur Bestätigung'}
          </button>
        </div>
        <p className="muted small-text">Kostenpflichtige Generierungen starten erst, nachdem du den Preis im nächsten Schritt bestätigst.</p>
      </form>
    </Section>
  )
}

// ------------------------------------------------------------------ cards
function PendingCard({ job, onReview }) {
  return (
    <div className="job-card pending">
      <div className="job-head">
        <div>
          <span className="source-badge"><Bot size={13} /> {SOURCE[job.source] || job.source}</span>
          <h3>{job.title}</h3>
          <p className="muted small-text">{job.scenes.length > 1 ? `${job.scenes.length} Szenen · ` : ''}{job.scenes.reduce((s, x) => s + x.duration, 0)} s · {job.settings.aspect_ratio} · {job.modelName}</p>
        </div>
        <strong className="price">{fmtUsd(job.estimate_usd)}</strong>
      </div>
      <button className="btn primary wide" onClick={onReview}><Check size={18} /> Prüfen & bestätigen</button>
    </div>
  )
}

function ProgressCard({ job, onCancel }) {
  return (
    <div className="job-card">
      <div className="job-head">
        <div>
          <h3>{job.title}</h3>
          <p className="muted small-text">{job.message}</p>
        </div>
        <button className="icon-btn ghost small" aria-label="Abbrechen" onClick={onCancel}><CircleStop size={20} /></button>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${Math.max(3, job.progress)}%` }} />
      </div>
      <div className="progress-meta">
        <span>{STATUS[job.status]}</span>
        <span>{job.progress} %</span>
      </div>
      {job.scenes.length > 1 && (
        <div className="scene-dots">
          {job.scenes.map((s) => <span key={s.index} className={`dot ${s.state}`} title={`Szene ${s.index + 1}`} />)}
        </div>
      )}
    </div>
  )
}

function VideoCard({ job, onOpen }) {
  const v = job.video
  return (
    <button className={`video-card ${ratioClass(job.settings.aspect_ratio)}`} onClick={onOpen}>
      <div className="video-thumb">
        {v?.poster ? <img src={mediaUrl(v.poster)} alt="" loading="lazy" /> : <video src={mediaUrl(v.url)} muted preload="metadata" />}
        <span className="play-badge"><Play size={18} fill="currentColor" /></span>
        {v?.duration && <span className="dur-badge">{Math.round(v.duration)} s</span>}
      </div>
      <strong>{job.title}</strong>
      <small className="muted">{fmtDate(job.completedAt || job.updatedAt)} · {job.settings.aspect_ratio}</small>
    </button>
  )
}

// ------------------------------------------------------------------ sheets
function ConfirmSheet({ job, health, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [showConcept, setShowConcept] = useState(false)
  const last = useRef(job)
  useEffect(() => { setShowConcept(false) }, [job?.id])
  const open = Boolean(job)
  if (job) last.current = job
  job = job || last.current
  if (!job) return null
  const limits = health?.limits
  const act = async (fn, msg) => {
    setBusy(true)
    try { onDone(await fn()); toast(msg) } catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Generierung bestätigen" className="studio-sheet">
      <div className="confirm-body">
        <h4>{job.title}</h4>
        <p className="muted small-text">Von {SOURCE[job.source] || job.source} · {job.modelName} · {job.settings.aspect_ratio} · {job.settings.resolution}{job.settings.audio ? ' · mit Ton' : ''}</p>
        {job.image?.url && <img className="confirm-image" src={mediaUrl(job.image.url)} alt="Startbild" />}
        {job.concept && (
          <div className="concept">
            <button className="concept-toggle" onClick={() => setShowConcept((v) => !v)}>Videokonzept <ChevronDown size={16} className={showConcept ? 'rot' : ''} /></button>
            {showConcept && <p className="concept-text">{job.concept}</p>}
          </div>
        )}
        <ol className="scene-review">
          {job.scenes.map((s) => (
            <li key={s.index}><span className="muted small-text">{job.scenes.length > 1 ? `Szene ${s.index + 1} · ` : ''}{s.duration} s{s.title ? ` · ${s.title}` : ''}</span><p>{s.prompt}</p></li>
          ))}
        </ol>
        <div className="confirm-price">
          <span>Geschätzte Kosten</span>
          <strong>{fmtUsd(job.estimate_usd)}</strong>
        </div>
        {limits && <p className="muted small-text">Limits: max. {fmtUsd(limits.maxCostPerJob)} pro Video · Tagesbudget {fmtUsd(limits.dailyBudget)} (heute bestätigt: {fmtUsd(limits.spentToday)}). Abgerechnet wird direkt beim Anbieter.</p>}
      </div>
      <div className="prompt-actions">
        <button className="btn secondary" disabled={busy} onClick={() => act(() => videoApi.reject(job.id), 'Auftrag abgelehnt')}>Ablehnen</button>
        <button className="btn primary" disabled={busy} onClick={() => act(() => videoApi.confirm(job.id, job.estimate_usd), 'Generierung gestartet')}>
          {busy ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />} Für {fmtUsd(job.estimate_usd)} generieren
        </button>
      </div>
    </Sheet>
  )
}

function VideoSheet({ job, onClose, onDeleted }) {
  const [del, setDel] = useState(false)
  const last = useRef(job)
  if (job) last.current = job
  const j = job || last.current
  return (
    <>
      <Sheet open={Boolean(job)} onClose={onClose} title={j?.title} className="studio-sheet video-sheet">
        {j && (
          <>
            <div className={`player-frame ${ratioClass(j.settings.aspect_ratio)}`}>
              <video key={j.id} src={mediaUrl(j.video.url)} poster={j.video.poster ? mediaUrl(j.video.poster) : undefined} controls playsInline autoPlay loop />
            </div>
            <div className="video-meta">
              <span><Clock size={14} /> {j.video.duration ? `${j.video.duration.toFixed(1)} s` : '–'}</span>
              {j.video.width && <span>{j.video.width}×{j.video.height}</span>}
              <span>{(j.video.bytes / 1e6).toFixed(1)} MB</span>
              <span>{j.modelName}</span>
            </div>
            <div className="prompt-actions">
              <a className="btn primary" href={mediaUrl(j.video.url) + '?download'} download={`${j.title || j.id}.mp4`}><Download size={18} /> Herunterladen</a>
              <button className="btn secondary" onClick={async () => {
                try { await navigator.clipboard.writeText(j.scenes.map((s) => s.prompt).join('\n\n')); toast('Prompt kopiert') } catch { toast('Kopieren nicht möglich') }
              }}><Copy size={18} /> Prompt</button>
              <button className="btn danger" onClick={() => setDel(true)} aria-label="Löschen"><Trash2 size={18} /></button>
            </div>
            <details className="prompt-details">
              <summary>Prompts & Konzept</summary>
              {j.concept && <p className="concept-text">{j.concept}</p>}
              {j.scenes.map((s) => <p key={s.index} className="muted small-text">{j.scenes.length > 1 ? `Szene ${s.index + 1}: ` : ''}{s.prompt}</p>)}
            </details>
          </>
        )}
      </Sheet>
      <Confirm open={del} onClose={() => setDel(false)} title="Video löschen?" text="Das Video wird vom Server gelöscht." onConfirm={async () => {
        try { await videoApi.remove(j.id); onDeleted(j.id); toast('Video gelöscht') } catch (e) { toast(e.message) }
      }} />
    </>
  )
}

function ServerSheet({ open, onClose, health, onSaved }) {
  const [cfg, setCfg] = useState(getServerConfig)
  useEffect(() => { if (open) setCfg(getServerConfig()) }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Video-Server">
      <form className="prompt" onSubmit={(e) => {
        e.preventDefault()
        setServerConfig({ url: cfg.url.trim(), token: cfg.token.trim() })
        onSaved(); onClose(); toast('Gespeichert')
      }}>
        <label className="field">
          <span>Server-Adresse (leer = gleiche Adresse wie die App)</span>
          <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} placeholder="https://mein-video-server.example.com" inputMode="url" autoCapitalize="off" />
        </label>
        <label className="field">
          <span>App-Token (VIDEO_APP_TOKEN, nur nötig wenn gesetzt)</span>
          <input type="password" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} autoComplete="off" />
        </label>
        {health && (
          <ul className="provider-status">
            {health.providers.map((p) => (
              <li key={p.id} className={p.configured ? 'ok' : ''}>{p.configured ? <Check size={15} /> : <X size={15} />} {p.name}{!p.configured && <small> – {p.keyHint}</small>}</li>
            ))}
            <li className={health.intakeConfigured ? 'ok' : ''}>{health.intakeConfigured ? <Check size={15} /> : <X size={15} />} ChatGPT-Schnittstelle{!health.intakeConfigured && <small> – VIDEO_INTAKE_TOKEN in .env</small>}</li>
          </ul>
        )}
        <div className="prompt-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn primary">Speichern</button>
        </div>
      </form>
    </Sheet>
  )
}

function ChatGPTInfo({ health }) {
  const schema = videoApi.openapiUrl()
  return (
    <Section title="ChatGPT verbinden">
      <div className="settings-card">
        <p className="ok-line"><Bot size={18} /> „Erstelle mir ein Video über …“</p>
        <p className="muted small-text">
          Lege in ChatGPT einen eigenen GPT an (Erkunden → GPT erstellen → Aktionen) und importiere das Schema unten.
          Authentifizierung: API-Schlüssel, Typ „Bearer“, Wert = <code>VIDEO_INTAKE_TOKEN</code>. ChatGPT entwickelt Konzept und Prompts und reicht den Auftrag ein –
          er erscheint hier unter „Wartet auf deine Bestätigung“. ChatGPT kann nichts Kostenpflichtiges selbst starten.
          Die Anleitung inkl. GPT-Anweisungen steht in <code>docs/VIDEO_STUDIO.md</code>.
        </p>
        <div className="copy-row">
          <code>{schema}</code>
          <button className="icon-btn ghost small" aria-label="Schema-URL kopieren" onClick={async () => {
            try { await navigator.clipboard.writeText(schema); toast('Kopiert') } catch { toast('Kopieren nicht möglich') }
          }}><Copy size={16} /></button>
        </div>
        {health && !health.publicUrl && <p className="muted small-text">Hinweis: ChatGPT braucht eine öffentlich erreichbare HTTPS-Adresse (PUBLIC_URL in .env).</p>}
      </div>
    </Section>
  )
}
