import type { Register } from 'claude-code'

type Hunk = { lines: string[] }

// Tools whose finished call draws as one line: the row carries the result, the result block draws nothing.
const MERGED = new Set(['Edit', 'Write', 'Bash', 'Agent'])
const COMMAND_MAX = 60
const OUTPUT_MAX = 60
// Matches the tool-row dot of the terminal theme in use (measured rgb 51,153,255).
const DOT_COLOR = '#3399ff'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const countLines = (text: string) =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text)

const countPatch = (hunks: Hunk[] | undefined) => {
  let added = 0
  let removed = 0
  for (const hunk of hunks ?? []) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}

const summarize = (tool: string, output: any): string | undefined => {
  if (!output || typeof output !== 'object') return undefined
  if (tool === 'Write' && output.type === 'create') {
    return plural(countLines(String(output.content ?? '')), 'line')
  }
  if (tool === 'Edit' || tool === 'Write') {
    const { added, removed } = countPatch(output.structuredPatch)
    return `+${added} -${removed}`
  }
  if (tool === 'Bash') {
    if (output.interrupted || output.isImage || output.backgroundTaskId) return undefined
    const text = [output.stdout, output.stderr].filter(Boolean).join('\n').trim()
    if (text === '') return '(no output)'
    const lines = text.split('\n')
    const first = cut(lines[0].trim(), OUTPUT_MAX)
    return lines.length > 1 ? `${first} (+${lines.length - 1})` : first
  }
  if (tool === 'Agent') {
    if (output.status === 'async_launched') return 'backgrounded'
    if (output.status === 'remote_launched') return 'remote'
    if (output.status === 'completed') {
      const secs = Math.round((output.totalDurationMs ?? 0) / 1000)
      return `done, ${plural(output.totalToolUseCount ?? 0, 'tool')}, ${secs}s`
    }
    return undefined
  }
  if (tool === 'NotebookEdit') {
    if (output.error) return undefined
    const cell = output.cell_id ? ` cell ${output.cell_id}` : ''
    return `Notebook ${output.edit_mode ?? 'edit'}${cell} (${countLines(String(output.new_source ?? ''))} lines)`
  }
  return undefined
}

const oneLine = (command: string) => {
  const lines = command.trim().split('\n')
  const first = lines[0].trim()
  return lines.length > 1 && first.length <= COMMAND_MAX ? `${first}...` : cut(first, COMMAND_MAX)
}

// Tools Claude Code folds into a ToolGroup line; the mod redraws a finished group as a compact row.
const isGroupable = (tool: string) =>
  tool.startsWith('mcp__') || ['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'].includes(tool)

type GroupCall = { tool: string; tool_use_id?: string; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

const groupLine = (calls: readonly GroupCall[]) => {
  const servers: string[] = []
  const counts = new Map<string, number>()
  for (const call of calls) {
    if (call.tool.startsWith('mcp__')) {
      const server = call.tool.split('__')[1] ?? call.tool
      if (!servers.includes(server)) servers.push(server)
      continue
    }
    const kind = call.tool === 'Read' ? 'read' : call.tool === 'Grep' || call.tool === 'Glob' ? 'search' : call.tool === 'Bash' ? 'bash' : call.tool
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  const parts: string[] = []
  if (servers.length) parts.push(`Called ${servers.join(', ')}${calls.length > 1 ? ` (${calls.filter(c => c.tool.startsWith('mcp__')).length})` : ''}`)
  for (const [kind, n] of counts) {
    if (kind === 'read') parts.push(`Read ${plural(n, 'file')}`)
    else if (kind === 'search') parts.push(`Searched ${plural(n, 'pattern')}`)
    else if (kind === 'bash') parts.push(`Ran ${plural(n, 'command')}`)
    else parts.push(n > 1 ? `${kind} (${n})` : kind)
  }
  return parts.join(', ')
}

type Message = {
  role: string
  text: string
  toolUses: { tool_use_id: string; tool: string }[]
  toolResults?: { tool_use_id: string; isError: boolean }[]
}

// Tool calls drawn right after a summary row: the terminal shows the model's interim text as a
// "· summary" row stored as a thinking block, so SessionMessage.text never sees it.
const afterSummary = (api: unknown) => {
  const ids = new Set<string>()
  if (!Array.isArray(api)) return ids
  for (const m of api as { role: string; content?: { type: string; id?: unknown; thinking?: unknown }[] }[]) {
    if (m.role !== 'assistant') continue
    let shown = false
    for (const b of m.content ?? []) {
      if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim() !== '') shown = true
      else if (b.type === 'tool_use' && typeof b.id === 'string') {
        if (shown) ids.add(b.id)
        shown = false
      }
    }
  }
  return ids
}

// A compact row gets a blank line above it unless the row before it is another compact row.
const findGaps = (messages: Message[], summaries: Set<string>, gaps: Map<string, boolean>) => {
  const errored = new Set<string>()
  for (const m of messages) for (const r of m.toolResults ?? []) if (r.isError) errored.add(r.tool_use_id)
  let prevCompact = false
  for (const m of messages) {
    if (m.text.trim() !== '') prevCompact = false
    for (const use of m.toolUses) {
      gaps.set(use.tool_use_id, !prevCompact || summaries.has(use.tool_use_id))
      prevCompact = (MERGED.has(use.tool) || isGroupable(use.tool)) && !errored.has(use.tool_use_id)
    }
  }
}

const refreshGaps = async ($: any, gaps: Map<string, boolean>) => {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) return
  findGaps(messages as Message[], afterSummary(await $.session.messages({ as: 'api' })), gaps)
}

export const register: Register = on => {
  const gaps = new Map<string, boolean>()

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, input, output, isRunning, isErrored, isInterrupted, isExpanded } = e.props
    if (!MERGED.has(tool) || isRunning || isErrored || isInterrupted || isExpanded !== false) return next(e)

    const summary = summarize(tool, output)
    if (summary === undefined) return next(e)

    const args = (input ?? {}) as { command?: unknown; file_path?: unknown; description?: unknown; subagent_type?: unknown }
    let label: string
    let detail: string
    if (tool === 'Agent' && typeof args.description === 'string') {
      label = typeof args.subagent_type === 'string' && args.subagent_type ? args.subagent_type : 'Agent'
      detail = cut(args.description, COMMAND_MAX)
    } else if (tool === 'Bash' && typeof args.command === 'string') {
      label = 'Bash'
      detail = oneLine(args.command)
    } else if (typeof args.file_path === 'string') {
      label = tool === 'Edit' ? 'Update' : 'Write'
      const cwd = await $.session.cwd()
      detail = args.file_path.startsWith(`${cwd}/`) ? args.file_path.slice(cwd.length + 1) : args.file_path
    } else {
      return next(e)
    }

    if (!gaps.has(e.props.tool_use_id)) await refreshGaps($, gaps)
    const gap = gaps.get(e.props.tool_use_id) !== false

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key={gap ? 'gap' : 'tight'} marginTop={gap ? 1 : 0}>
        <Text wrap="truncate-end">
          <Text color={DOT_COLOR}>{'● '}</Text>
          <Text dimColor>
            {label}({detail}) {summary}
          </Text>
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const { calls, isActive, isExpanded, isCallsOnly } = e.props
    if (isActive || isExpanded || isCallsOnly !== true || calls.length === 0) return next(e)
    if (calls.some(c => c.isRunning || c.isErrored || c.isInterrupted)) return next(e)

    const firstId = calls[0].tool_use_id
    if (firstId !== undefined && !gaps.has(firstId)) await refreshGaps($, gaps)
    const gap = firstId === undefined || gaps.get(firstId) !== false

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key={gap ? 'gap' : 'tight'} marginTop={gap ? 1 : 0}>
        <Text wrap="truncate-end">
          <Text color={DOT_COLOR}>{'\u25CF '}</Text>
          <Text dimColor>{groupLine(calls)}</Text>
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    const { tool, output, isErrored, isExpanded } = e.props
    if (isErrored || isExpanded !== false) return next(e)

    const summary = summarize(tool, output)
    if (summary === undefined) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return MERGED.has(tool) ? <Box /> : <Text dimColor>{summary}</Text>
  })
}
