// Speech output (Web Speech Synthesis) and input (Web Speech Recognition), German.
let voice = null
function pickVoice() {
  const vs = window.speechSynthesis?.getVoices() || []
  voice = vs.find((v) => v.lang === 'de-DE' && /Anna|Helena|Google|Premium|Enhanced/i.test(v.name))
    || vs.find((v) => v.lang?.startsWith('de')) || null
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  pickVoice()
  window.speechSynthesis.onvoiceschanged = pickVoice
}

export function speak(text, { interrupt = true } = {}) {
  const ss = window.speechSynthesis
  if (!ss || !text) return
  if (interrupt) ss.cancel()
  const clean = text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = 'de-DE'
  if (voice) u.voice = voice
  u.rate = 1.03
  ss.speak(u)
}

export function stopSpeaking() { window.speechSynthesis?.cancel() }

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const canListen = !!SR

// Listen once; resolves with the final transcript. onPartial gets interim text.
export function listen(onPartial) {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('Spracheingabe wird von diesem Browser nicht unterstützt'))
    const rec = new SR()
    rec.lang = 'de-DE'
    rec.interimResults = true
    rec.maxAlternatives = 1
    let final = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      onPartial?.(final + interim)
    }
    rec.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Mikrofon-Zugriff verweigert' : e.error))
    rec.onend = () => resolve(final.trim())
    rec.start()
    listen.stop = () => rec.stop()
  })
}

// Short warning tone (collision / speeding)
let actx
export function beep(freq = 880, ms = 160, times = 2) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator()
      const g = actx.createGain()
      const t = actx.currentTime + i * (ms / 1000) * 1.6
      o.frequency.value = freq
      o.type = 'square'
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
      o.connect(g).connect(actx.destination)
      o.start(t)
      o.stop(t + ms / 1000 + 0.02)
    }
  } catch { /* audio not available */ }
}
