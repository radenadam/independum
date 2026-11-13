# Independum

Independum is a local harness for building your own agent. Its default profile also provides an agent you can use after connecting a model login or API key. You start it from a terminal and work in a browser on a computer or phone.

The defining promise is complete visibility and control, from an understandable overview down to exact model input and individual mechanisms. Control works on screen, in plain files, and headless. See the [product definition](docs/product/README.md) for the contract and the [checkpoint](docs/checkpoint.md) for what works and what remains.

This is development software. Building is stopped for repository healing. Substantial machinery exists, but the technical readiness checkpoint is incomplete. [Current work](docs/work.md) records the resumption condition.

Contributors and agents start with [AGENTS.md](AGENTS.md). The repository uses Node.js 24.21 or newer and pnpm. `pnpm install` installs dependencies and the pre-commit hook. `pnpm dev` starts development. `pnpm preview` starts an isolated stand-in agent. `pnpm format` formats, and `pnpm check` runs deterministic checks without real models. [Local gates](docs/checks.md) describe review and browser QA.

Independum is MIT licensed. Packaging, final release documentation, the website, and broader agent capabilities remain later work.
