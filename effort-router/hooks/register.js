// effort-router — the right reasoning effort for every prompt, without breaking the cache.
//
// Why not switch models per prompt? The prompt cache belongs to one model. Jumping between
// Haiku and Opus re-reads your whole context uncached on every jump, which on a long
// session costs more than it saves. So the main conversation keeps its model and only the
// EFFORT changes: low for "ok, go on", high for real work.
// Subagents start from an empty context, so moving them to a cheaper model costs no cache:
// opt in with `/effort-router subagents <model-id>` (for example claude-sonnet-5-5).
// Classification is local keyword matching: zero tokens. When unsure: medium.
// Above 80% of the 5-hour plan window, effort drops one step.

const HARD = /\b(debug|bug|error|fail|crash|refactor|architect|design|implement|build|write|migrat|optimi[sz]|secur|review|analy[sz]|investigat|why|root cause|performance|test|deploy|production|money|trading|strateg|research|compare|plan)/i
const EASY = /^\s*(ok(ay)?|yes|yep|no|go( on| ahead)?|continue|proceed|thanks?|thank you|great|perfect|nice|done|sure|status|show|open|next|lgtm)(?=[\s,.!?]|$)/i
const STEPS = ['low', 'medium', 'high']
const EFFORT = { easy: 'low', medium: 'medium', hard: 'high' }

export function classify(text) {
  const t = (text || '').trim()
  if (HARD.test(t)) return 'hard'
  if (t.length > 600) return 'hard'
  if (EASY.test(t) && t.length < 120) return 'easy'
  return 'medium'
}

export function stepDown(effort) {
  const i = STEPS.indexOf(effort)
  return i > 0 ? STEPS[i - 1] : effort
}

let level = 'hard'
let highUsage = false
const counts = { easy: 0, medium: 0, hard: 0, subagents_moved: 0 }

export function register(on) {
  on('session.start', async ($, e, next) => {
    try { await $.command.register({ name: 'effort-router', description: 'Stats and settings. Args: on | off | subagents <model-id> | subagents off', argumentHint: '[on|off|subagents <model-id>|subagents off]', immediate: true }) } catch {}
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const kind = e.origin ? e.origin.kind : 'unclassified'
    if (kind === 'composer' || kind === 'bridge') {
      level = classify(e.text)
      counts[level] += 1
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const five = (e.rateLimits || []).find((l) => l.kind === 'five_hour')
    highUsage = !!five && five.percentUsed >= 80
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if ((await $.store.get('off')) === true) return yield* next(e)
    if (e.agentId) {
      const target = await $.store.get('subagent_model')
      if (target && level !== 'hard' && e.model !== target) {
        counts.subagents_moved += 1
        return yield* next({ ...e, model: target })
      }
      return yield* next(e)
    }
    let effort = EFFORT[level]
    if (highUsage) effort = stepDown(effort)
    return yield* next({ ...e, effort })
  })

  on('command.run', { command: 'effort-router' }, async ($, e) => {
    const args = (e.args || '').trim().split(/\s+/)
    if (args[0] === 'off') { await $.store.set('off', true); return { text: 'effort-router OFF: model and effort stay as the session sets them.' } }
    if (args[0] === 'on') { await $.store.set('off', false); return { text: 'effort-router ON.' } }
    if (args[0] === 'subagents') {
      if (!args[1] || args[1] === 'off') { await $.store.set('subagent_model', null); return { text: 'Subagents keep their own model.' } }
      await $.store.set('subagent_model', args[1])
      return { text: 'Subagents on non-hard tasks will use ' + args[1] + '.' }
    }
    const off = (await $.store.get('off')) === true
    const target = await $.store.get('subagent_model')
    return { text: 'effort-router ' + (off ? 'OFF' : 'ON') + ' · last prompt: ' + level + ' (effort ' + EFFORT[level] + (highUsage ? ', stepped down: plan above 80%' : '') + ')' +
      '\nprompts classified: easy ' + counts.easy + ' · medium ' + counts.medium + ' · hard ' + counts.hard +
      '\nsubagent model: ' + (target || 'unchanged') + ' · requests moved: ' + counts.subagents_moved }
  })
}
