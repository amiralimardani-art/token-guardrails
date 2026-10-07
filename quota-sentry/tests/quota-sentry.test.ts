import { expect, mock, test } from 'claude-code/testing'

function base(on) {
  mock.store(on, {})
  on('ui.log', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
}

test('the 21st headless run in an hour is dropped', async ($, on) => {
  base(on)
  for (let i = 0; i < 20; i++) {
    const r = await $.prompt.submit({ text: 'run ' + i, wait: false, origin: { kind: 'sdk' } })
    expect(r.drop).toBeUndefined()
  }
  const r = await $.prompt.submit({ text: 'run 21', wait: false, origin: { kind: 'sdk' } })
  expect(r.drop).toContain('quota-sentry')
})

test('your own prompts are never blocked', async ($, on) => {
  base(on)
  for (let i = 0; i < 40; i++) {
    const r = await $.prompt.submit({ text: 'hi ' + i, wait: false, origin: { kind: 'composer' } })
    expect(r.drop).toBeUndefined()
  }
})

test('15 automatic turns in a row ask, and stop when nobody answers', async ($, on) => {
  base(on)
  on('tool.call', () => ({ deny: 'nobody to ask' }))
  for (let i = 0; i < 14; i++) {
    const r = await $.prompt.submit({ text: 'n' + i, wait: false, origin: { kind: 'task-notification' } })
    expect(r.drop).toBeUndefined()
  }
  const r = await $.prompt.submit({ text: 'n15', wait: false, origin: { kind: 'task-notification' } })
  expect(r.drop).toContain('quota-sentry')
})

test('a message from you resets the automatic streak', async ($, on) => {
  base(on)
  on('tool.call', () => ({ deny: 'nobody to ask' }))
  for (let i = 0; i < 14; i++) await $.prompt.submit({ text: 'n' + i, wait: false, origin: { kind: 'task-notification' } })
  await $.prompt.submit({ text: 'me', wait: false, origin: { kind: 'composer' } })
  const r = await $.prompt.submit({ text: 'after', wait: false, origin: { kind: 'task-notification' } })
  expect(r.drop).toBeUndefined()
})
