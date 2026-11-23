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

## How to install (for Claude and other AI tools)

Steps for an agent installing this mod for its user. Run them in a shell, in order, and stop
at the first step that fails.

1. Check the version. The output must be `2.1.290` or later; if it is older, stop and tell the
   user to update Claude Code first.

   ```
   claude --version
   ```

2. Check that the mod is not already loaded from a local folder. If this prints a path that
   ends in `compact-tools`, the mod is already active: stop and tell the user. Installing it a
   second time draws every row twice.

   ```
   grep -n CLAUDE_CODE_PLUGIN_DIRS ~/.claude/settings.json
   ```

3. Install. This adds the marketplace and installs the mod at user scope in one call, with no
   prompt. Add `--scope project` only if the user asked for this project alone.

   ```
   claude plugin install compact-tools --marketplace victor-schumann/claude-compact-toolcall-plugin --json
   ```

4. Verify. The output must list `compact-tools` as installed and enabled.

   ```
   claude plugin list --json
   ```

5. Tell the user to restart Claude Code (or start a new session). The mod loads at session
   start, so the current session keeps the normal rendering. After the restart, finished
   Edit, Write and Bash calls draw as one gray line each.

To remove it: `claude plugin uninstall compact-tools`.

## Tests

```
claude plugin test .
```
