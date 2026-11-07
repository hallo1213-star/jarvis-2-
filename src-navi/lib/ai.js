// NOVA – the in-car AI, powered by Claude (Anthropic API, called directly from the browser
// with the user's own API key which never leaves this device except to api.anthropic.com).
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'

const SYSTEM = `Du bist NOVA, die KI im Navi „NOVA Drive“. Du sitzt quasi mit im Auto.
- Sprich Deutsch (außer der Nutzer spricht eine andere Sprache), locker, freundlich, mit etwas Witz – wie ein guter Beifahrer.
- Du kannst über ALLES reden: Fragen, Wissen, Geschichten, Witze, Musik-Tipps, Smalltalk, Rat.
- Deine Antworten werden oft vorgelesen, während jemand fährt: halte sie kurz (meist 1–3 Sätze), ohne Markdown, Listen oder Emojis – außer der Nutzer will ausdrücklich mehr.
- Für Navigation nutze die Tools: navigate_to startet eine Route, search_places sucht Orte in der Nähe, get_trip_status liefert Position, Tempo, Route und erkannte Fahrzeuge vor dem Auto, stop_navigation beendet die Führung.
- Wenn jemand „bring mich zu …“, „fahr zu …“ oder „ich will zu …“ sagt, rufe navigate_to auf. Bei mehreren passenden Orten nimm den nächstgelegenen sinnvollen.
- Für aktuelle Infos (Wetter, News, Öffnungszeiten, Sport) nutze die Websuche, wenn verfügbar.
- Sicherheit geht vor: fordere den Fahrer nie auf, während der Fahrt aufs Handy zu schauen oder zu tippen.`

const TOOLS = [
  {
    name: 'navigate_to',
    description: 'Sucht ein Ziel (Adresse, Ort, Geschäft, Kategorie wie „Tankstelle“) in der Nähe des Nutzers und startet sofort die Navigation dorthin. Gibt Ziel, Entfernung und Fahrzeit zurück.',
    input_schema: {
      type: 'object',
      properties: { destination: { type: 'string', description: 'Ziel, z. B. „Alexanderplatz Berlin“ oder „nächste Tankstelle“' } },
      required: ['destination'],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: 'search_places',
    description: 'Sucht Orte (z. B. Restaurants, Tankstellen, Adressen) in der Nähe und gibt bis zu 6 Treffer mit Entfernung zurück, ohne die Route zu ändern.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Suchbegriff' } },
      required: ['query'],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: 'get_trip_status',
    description: 'Aktueller Status: Position/Straße, Geschwindigkeit, Tempolimit, aktive Route (Ziel, Restdistanz, Ankunft, nächstes Manöver) und von der Kamera erkannte Fahrzeuge vor dem Auto.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: 'stop_navigation',
    description: 'Beendet die aktuelle Zielführung.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
]
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 3 }

// With eager input streaming the API does not validate tool input – do it here.
function validInput(name, input) {
  if (!input || typeof input !== 'object') return false
  if (name === 'navigate_to') return typeof input.destination === 'string' && input.destination.trim().length > 0
  if (name === 'search_places') return typeof input.query === 'string' && input.query.trim().length > 0
  return true
}

export class NovaAI {
  constructor() {
    this.history = [] // full message history (assistant content kept verbatim)
    this.webSearch = true
  }

  reset() { this.history = [] }

  /**
   * Send a user message. `runTool(name, input)` executes app tools and returns a JSON-able result.
   * `onText(fullTextSoFar)` streams the reply; `onTool(name)` shows tool activity.
   */
  async send({ apiKey, text, context, runTool, onText, onTool }) {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
    const content = [{ type: 'text', text }]
    if (context) content.push({ type: 'text', text: `[Kontext – automatisch, nicht vom Nutzer: ${context}]` })
    const start = this.history.length
    this.history.push({ role: 'user', content })

    let reply = ''
    try {
      for (let turn = 0; turn < 8; turn++) {
        const tools = this.webSearch ? [...TOOLS, WEB_SEARCH] : TOOLS
        let msg
        try {
          msg = await this.#stream(client, tools, (delta) => { reply += delta; onText?.(reply) })
        } catch (err) {
          // Web search may be disabled for the organisation – retry once without it.
          if (this.webSearch && err instanceof Anthropic.BadRequestError && /web_search/i.test(err.message)) {
            this.webSearch = false
            turn--
            continue
          }
          throw err
        }
        this.history.push({ role: 'assistant', content: msg.content })

        if (msg.stop_reason === 'refusal') {
          reply ||= 'Dabei kann ich leider nicht helfen.'
          onText?.(reply)
          break
        }
        if (msg.stop_reason === 'max_tokens') break
        if (msg.stop_reason === 'pause_turn') continue // server tool (web search) still working
        if (msg.stop_reason !== 'tool_use') break

        const results = []
        for (const block of msg.content) {
          if (block.type !== 'tool_use') continue
          onTool?.(block.name)
          let result
          let isError = false
          if (!validInput(block.name, block.input)) {
            result = { error: 'INVALID_INPUT – bitte Tool mit gültigen Parametern erneut aufrufen' }
            isError = true
          } else {
            try { result = await runTool(block.name, block.input) } catch (e) { result = { error: e.message }; isError = true }
          }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), is_error: isError })
        }
        this.history.push({ role: 'user', content: results })
        if (reply && !/\s$/.test(reply)) reply += ' '
      }
    } catch (err) {
      // Keep history valid: drop this unfinished exchange
      this.history.length = start
      if (err instanceof Anthropic.AuthenticationError) throw new Error('API-Schlüssel ungültig – bitte in den Einstellungen prüfen.')
      if (err instanceof Anthropic.RateLimitError) throw new Error('Zu viele Anfragen – kurz warten und nochmal versuchen.')
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Keine Verbindung zur KI. Bist du online?')
      if (err instanceof Anthropic.APIError) throw new Error(`KI-Fehler ${err.status ?? ''}: ${err.message}`)
      throw err
    }
    return reply.trim()
  }

  async #stream(client, tools, onDelta) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // fast, chatty answers in the car
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: this.history,
    })
    stream.on('text', onDelta)
    return stream.finalMessage()
  }
}
