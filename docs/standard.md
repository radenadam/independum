# The standard of the maintainer

This page collects how the maintainer judges work on Independum, from the evaluations so far, so that an agent meets the standard the first time instead of learning it from corrections. `AGENTS.md` holds the rules that checks enforce. This page holds the judgment behind them. When an evaluation finds a new point, it lands here or in `AGENTS.md`.

## Who Independum is for

- People who learn agentic engineering and experiment with it, and people who build their own workflow with agents and need fine control over it. Many of them are not programmers.
- They see everything that the model gets and everything that happens around it on screen, and they control it there. The same settings also live in plain files that they can edit in a text editor, such as a settings file, hooks, or a `SYSTEM.md`.
- Scripts and other agents drive Independum from the command line, without the UI, and the phone works as well as the computer.
- Tools and other parts that are not built in come as add-ons, which a user or their agent can write.

## What the model gets

Independum gives the model complete facts and good functions, and never steers it. A professional who is handed a new tool needs no guide, but cannot plan with it before knowing what it is. So the shell tool names the shell and its version, and the same goes for every tool and for the harness:

- Facts in scope are things the model cannot know or know reliably by itself, such as the time, the time of each message and result, its own knowledge cutoff, the harness it runs in, the operating system, and the folder it works in.
- A best practice, a rule of conduct, or a hint about how to work is out of scope. Steering is only acceptable inside a feature whose purpose is to steer, such as compaction or memory, and the user can see and turn off that feature.
- Everything that Independum or Pi adds to the context shows on screen, and the user can turn it off.

## How work is judged

- **Every number and fact is exact.** Two places that show one quantity agree, or each says what it counts. A sum in a legend adds up to its rows.
- **One look, one meaning.** `docs/design.md` says which look means what. A look that means two things, or two looks for one thing, is a bug even when each piece looks fine on its own.
- **Proportion.** Spacing, type, and weight sit in balance. The tool cards are the reference the maintainer likes.
- **Nothing twice.** A control or a fact that already lives somewhere else does not come back in another place. A page that only repeats a table is filler.
- **Details on demand.** The overview shows what matters at a glance, and a row opens the rest.
- **It holds in the long case.** A screen works in a chat with hundreds of requests and several compactions, not only in a short one.
- **Light and dark, 360 pixels, and touch** all work.
- **Plain words.** A label says what happens, such as Show requests 1 to 3, and a note says one fact.

## How to work with the maintainer

- Check a change in the running app, with the stand-in model or a real one, before saying it works, and say what was not checked.
- When asked for an opinion, give one recommendation with its reasons, also when it disagrees with the maintainer. A survey of options without a pick is not an answer.
- When the maintainer cannot put a wish into words, mock options side by side on a canvas with the same content, each with the one rule it follows, today's version beside them, and a long case.
- When the maintainer changes their mind, follow the new choice and record why in the decision.

## What an agent decides, and what it asks

An agent decides on its own:

- How to build what is agreed: code structure, internal names, tests, and refactors.
- Fixes of clear bugs, where the right behavior is not in doubt.
- Anything that an existing pattern, decision, or rule already covers, which it follows.

An agent asks the maintainer first:

- A new look or interaction that `docs/design.md` does not cover, and anything that a user sees for the first time, such as a new feature or place.
- A tool, as the Tools section of `AGENTS.md` describes.
- Any change to an accepted decision, and the removal of anything a user relies on.
- Anything that touches credentials, security, or privacy.
- An open question of `docs/roadmap.md`.
