# compact-tools

A Claude Code mod that draws each finished tool call as one gray line, result included,
with a blank line only before each run of calls (after your prompt or a text reply):

```
● Update(src/app.py) +2 -1
● Write(tmp/demo.py) 20 lines
● Bash(cd ~/project && ls -d *test* | head...) tests/ (+4)
```

Commands and output lines are cut at 60 characters, and the whole line at the terminal edge.
The dot keeps the tool-row blue (`#3399ff`, hard-coded). NotebookEdit results get a one-line
summary under Claude Code's own row.

Ctrl+O and `--verbose` still show full diffs and output. Errors, interrupted commands,
background tasks and image output are left as Claude Code draws them.

Needs Claude Code 2.1.290 or later (mods API, early access: an update may change it; if the
mod breaks, Claude Code falls back to its normal rendering).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install compact-tools --marketplace victor-schumann/claude-compact-toolcall-plugin
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install compact-tools --marketplace victor-schumann/claude-compact-toolcall-plugin
```

To run it from a local checkout instead, set `CLAUDE_CODE_PLUGIN_DIRS` to this folder in the
`env` block of `~/.claude/settings.json`.

## Tests

```
claude plugin test .
```
