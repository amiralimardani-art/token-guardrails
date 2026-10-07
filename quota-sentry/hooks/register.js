// quota-sentry — stops runaway Claude Code loops before they burn your plan.
//
// 1. Headless runs (`claude -p`): more than MAX_HEADLESS_PER_HOUR in one hour, counted
//    across every session on this machine, and the next one is dropped. A script that
//    calls `claude -p` every minute is stopped after 20 minutes, not after 13 hours.
// 2. Inside a session: after MAX_AUTO_STREAK automatic turns in a row (notifications,
//    messages from other sessions, prompts from other plugins) with no message from you,
//    it asks before continuing. With nobody to ask, it stops.
// 3. Warns when your 5-hour or 7-day plan window passes 80% and 95%.
// Your own prompts are never blocked. `/quota-sentry` shows the counters;
// `/quota-sentry pause` disables the blocks for one hour.

const MAX_HEADLESS_PER_HOUR = 20
const MAX_AUTO_STREAK = 15
const HOUR = 3_600_000
const HUMAN = ['composer', 'bridge']

let autoStreak = 0
const warned = {}

async function headlessRuns($) {
  const now = Date.now()
  return ((await $.store.get('headless_runs')) || []).filter((t) => now - t < HOUR)
}

async function paused($) {
  const until = await $.store.get('paused_until')
  return typeof until === 'number' && until > Date.now()
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try { await $.command.register({ name: 'quota-sentry', description: 'Loop-guard counters and plan usage. Args: pause | resume', argumentHint: '[pause|resume]', immediate: true }) } catch {}
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const kind = e.origin ? e.origin.kind : 'unclassified'
    if (HUMAN.includes(kind)) {
      autoStreak = 0
      return next(e)
    }
    const isPaused = await paused($)

    if (kind === 'sdk') {
      const runs = await headlessRuns($)
      if (runs.length >= MAX_HEADLESS_PER_HOUR && !isPaused) {
        $.ui.log('quota-sentry: blocked a headless run (' + runs.length + ' in the last hour)')
        return { drop: 'quota-sentry: ' + runs.length + ' headless Claude runs in the last hour (limit ' + MAX_HEADLESS_PER_HOUR + '). This looks like a loop, so it was stopped to protect your plan. To allow more for an hour, run /quota-sentry pause in an interactive session.' }
      }
      runs.push(Date.now())
      await $.store.set('headless_runs', runs)
      return next(e)
    }

    autoStreak += 1
    if (autoStreak >= MAX_AUTO_STREAK && !isPaused) {
      let answer = 'Stop'
      try {
        answer = await $.ui.ask(autoStreak + ' automatic turns in a row without a message from you. This may be a loop that is spending your plan. Continue?', ['Continue', 'Stop'])
      } catch {}
      if (answer !== 'Continue') {
        return { drop: 'quota-sentry: stopped after ' + autoStreak + ' automatic turns in a row without a message from the user.' }
      }
      autoStreak = 0
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    for (const l of e.rateLimits || []) {
      for (const level of [80, 95]) {
        const key = l.kind + level
        if (l.percentUsed >= level && !warned[key]) {
          warned[key] = true
          $.ui.toast('Claude plan: ' + l.kind + ' window at ' + l.percentUsed + '%' + (l.resetsAt ? ', resets ' + l.resetsAt.slice(11, 16) + ' UTC' : ''))
        }
      }
    }
    return next(e)
  })

  on('command.run', { command: 'quota-sentry' }, async ($, e) => {
    const arg = (e.args || '').trim()
    if (arg === 'pause') { await $.store.set('paused_until', Date.now() + HOUR); return { text: 'quota-sentry paused for one hour.' } }
    if (arg === 'resume') { await $.store.set('paused_until', 0); return { text: 'quota-sentry active again.' } }
    const u = await $.session.usage()
    const runs = await headlessRuns($)
    const lines = (u.rateLimits || []).map((l) => l.kind + ' window: ' + l.percentUsed + '%' + (l.resetsAt ? ' (resets ' + l.resetsAt + ')' : ''))
    if (!lines.length) lines.push('plan windows: no reading yet (arrives after the first model reply)')
    if (u.cost) lines.push('this session: ' + u.cost.usd.toFixed(2) + ' USD')
    lines.push('headless runs in the last hour: ' + runs.length + '/' + MAX_HEADLESS_PER_HOUR)
    lines.push('automatic turns in a row: ' + autoStreak + '/' + MAX_AUTO_STREAK)
    lines.push('blocks: ' + ((await paused($)) ? 'PAUSED' : 'active'))
    return { text: lines.join('\n') }
  })
}
