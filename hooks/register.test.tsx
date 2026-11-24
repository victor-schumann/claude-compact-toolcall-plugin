import { expect, test } from 'claude-code/testing'

const EDIT = {
  filePath: '/work/x.py', oldString: 'a', newString: 'b', originalFile: 'a\n',
  userModified: false, replaceAll: false,
  structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' ctx', '-a', '+b', '+c'] }],
}
const WRITE = { type: 'create', filePath: '/work/n.py', content: 'one\ntwo\nthree\n', structuredPatch: [], originalFile: null }
const BASH = { stdout: 'COMPILED\nline two\nline three\n', stderr: '', interrupted: false }
const DONE = { isRunning: false, isErrored: false, isInterrupted: false, isExpanded: false }

const rowText = async ($: any, surface: 'terminal' | 'desktop', tool: string, input: unknown, output: unknown, flags = DONE, id = 'r') => {
  const ui = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolUse', surface, props: { tool_use_id: id, tool, input, output, ...flags } })
  const found = await ui.find({ type: 'Text' })
  await ui.unmount()
  return JSON.stringify(found ?? null)
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: edit row carries the counts`, async ($, on) => {
    on('session.cwd', () => ({ value: '/work' }))
    on('session.messages', () => ({ value: [] }))
    expect(await rowText($, surface, 'Edit', { file_path: '/work/x.py', old_string: 'a', new_string: 'b' }, EDIT)).toContain('Update(x.py) +2 -1')
  })

  test(`${surface}: new file row carries the line count`, async ($, on) => {
    on('session.cwd', () => ({ value: '/work' }))
    on('session.messages', () => ({ value: [] }))
    expect(await rowText($, surface, 'Write', { file_path: '/work/n.py', content: 'x' }, WRITE)).toContain('Write(n.py) 3 lines')
  })

  test(`${surface}: bash row carries the first output line`, async ($, on) => {
    on('session.messages', () => ({ value: [] }))
    expect(await rowText($, surface, 'Bash', { command: 'make\necho hi' }, BASH)).toContain('Bash(make...) COMPILED (+2)')
  })

  test(`${surface}: bash with no output`, async ($, on) => {
    on('session.messages', () => ({ value: [] }))
    expect(await rowText($, surface, 'Bash', { command: 'true' }, { stdout: '', stderr: '', interrupted: false })).toContain('(no output)')
  })

  test(`${surface}: running, errored and expanded rows pass through`, async ($, on) => {
    on('session.messages', () => ({ value: [] }))
    for (const flags of [{ ...DONE, isRunning: true }, { ...DONE, isErrored: true }, { ...DONE, isExpanded: true }]) {
      expect(await rowText($, surface, 'Bash', { command: 'make' }, BASH, flags)).not.toContain('COMPILED')
    }
  })

  test(`${surface}: merged result block draws no text`, async $ => {
    const ui = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolResult', surface, props: { tool_use_id: 'r', tool: 'Bash', output: BASH, isErrored: false, isExpanded: false } })
    expect(await ui.find({ type: 'Text' })).toBeUndefined()
    await ui.unmount()
  })
}

const TRANSCRIPT = [
  { role: 'user', text: 'do it', toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'a', tool: 'Bash' }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'a', text: 'x', isError: false }] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b', tool: 'Bash' }] },
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: first row after the prompt gets a gap, the next one none`, async ($, on) => {
    on('session.messages', () => ({ value: TRANSCRIPT }))
    const a = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolUse', surface, props: { tool_use_id: 'a', tool: 'Bash', input: { command: 'ls' }, output: BASH, ...DONE } })
    expect(await a.find({ key: 'gap' })).toBeDefined()
    await a.unmount()
    const b = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolUse', surface, props: { tool_use_id: 'b', tool: 'Bash', input: { command: 'ls' }, output: BASH, ...DONE } })
    expect(await b.find({ key: 'tight' })).toBeDefined()
    await b.unmount()
  })
}

const GROUP_TRANSCRIPT = [
  { role: 'user', text: 'go', toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'g1', tool: 'mcp__github__search_issues' }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'g1', text: 'x', isError: false }] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'g2', tool: 'mcp__browser__navigate' }] },
]
const call = (id: string, tool: string) => ({ tool_use_id: id, tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok' })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: finished mcp groups draw one line, tight after another`, async ($, on) => {
    on('session.messages', () => ({ value: GROUP_TRANSCRIPT }))
    const g = { isActive: false, isExpanded: false, isCallsOnly: true }
    const a = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolGroup', surface, props: { ...g, calls: [call('g1', 'mcp__github__search_issues')] } })
    expect(await a.find({ key: 'gap' })).toBeDefined()
    expect(await a.find({ type: 'Text', text: /Called github/ })).toBeDefined()
    await a.unmount()
    const b = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolGroup', surface, props: { ...g, calls: [call('g2', 'mcp__browser__navigate')] } })
    expect(await b.find({ key: 'tight' })).toBeDefined()
    await b.unmount()
  })
}

const SUMMARY_TRANSCRIPT = [
  { role: 'user', text: 'go', toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 's1', tool: 'Bash' }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 's1', text: 'x', isError: false }] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 's2', tool: 'Bash' }] },
]
const SUMMARY_API = [
  { role: 'user', content: [{ type: 'text', text: 'go' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 's1', name: 'Bash', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 's1', content: 'x' }] },
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'Making one SSH attempt next.' }, { type: 'tool_use', id: 's2', name: 'Bash', input: {} }] },
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a row after a summary row gets a gap`, async ($, on) => {
    on('session.messages', (_: any, e: any) => ({ value: e?.as === 'api' ? SUMMARY_API : SUMMARY_TRANSCRIPT }))
    const b = await $.ui.mount({ plugin: 'compact-tools', component: 'ToolUse', surface, props: { tool_use_id: 's2', tool: 'Bash', input: { command: 'ls' }, output: BASH, ...DONE } })
    expect(await b.find({ key: 'gap' })).toBeDefined()
    await b.unmount()
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: backgrounded agent draws one line`, async ($, on) => {
    on('session.messages', () => ({ value: [] }))
    const input = { description: 'Add build-log check recipe', subagent_type: 'librarian', prompt: 'x' }
    const output = { status: 'async_launched', agentId: 'a1', description: 'Add build-log check recipe', prompt: 'x', outputFile: '/tmp/o' }
    expect(await rowText($, surface, 'Agent', input, output)).toContain('librarian(Add build-log check recipe) backgrounded')
  })

  test(`${surface}: finished agent shows tools and time`, async ($, on) => {
    on('session.messages', () => ({ value: [] }))
    const output = { status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 5, totalDurationMs: 19337, totalTokens: 1, usage: {}, prompt: 'x' }
    expect(await rowText($, surface, 'Agent', { description: 'Review diff', prompt: 'x' }, output)).toContain('Agent(Review diff) done, 5 tools, 19s')
  })
}
