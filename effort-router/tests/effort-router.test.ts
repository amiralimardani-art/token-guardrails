import { expect, mock, test } from 'claude-code/testing'
import { classify, stepDown } from '../hooks/register.js'

test('local classification', () => {
  expect(classify('ok go on')).toBe('easy')
  expect(classify('yes')).toBe('easy')
  expect(classify('thanks!')).toBe('easy')
  expect(classify('debug the failing test and find the root cause')).toBe('hard')
  expect(classify('ok but refactor the auth module')).toBe('hard')
  expect(classify('what is the capital of France')).toBe('medium')
  expect(stepDown('high')).toBe('medium')
  expect(stepDown('low')).toBe('low')
})

async function step($, req) {
  const s = $.turn.step(req)
  let p = await s.next()
  while (p.done !== true) p = await s.next()
  return p.value
}

function base(on, seen, store) {
  mock.store(on, store)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.step', async function* ($, e) {
    seen.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null }
  })
}

test('main conversation: same model, effort follows the prompt', async ($, on) => {
  const seen = []
  base(on, seen, {})
  await $.prompt.submit({ text: 'ok go on', wait: false, origin: { kind: 'composer' } })
  await step($, { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  await $.prompt.submit({ text: 'debug the crash', wait: false, origin: { kind: 'composer' } })
  await step($, { turnId: 't2', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
  expect(seen[0]).toMatchObject({ model: 'claude-opus-5-5', effort: 'low' })
  expect(seen[1]).toMatchObject({ model: 'claude-opus-5-5', effort: 'high' })
})

test('subagents keep their model unless you opt in', async ($, on) => {
  const seen = []
  base(on, seen, {})
  await $.prompt.submit({ text: 'list the log files', wait: false, origin: { kind: 'composer' } })
  await step($, { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' })
  expect(seen[0].model).toBe('claude-opus-5-5')
})

test('with opt-in, subagents move to the chosen model except on hard tasks', async ($, on) => {
  const seen = []
  base(on, seen, { subagent_model: 'claude-sonnet-5-5' })
  await $.prompt.submit({ text: 'list the log files', wait: false, origin: { kind: 'composer' } })
  await step($, { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' })
  await $.prompt.submit({ text: 'debug the production crash', wait: false, origin: { kind: 'composer' } })
  await step($, { turnId: 't2', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a2' })
  expect(seen[0].model).toBe('claude-sonnet-5-5')
  expect(seen[1].model).toBe('claude-opus-5-5')
})
