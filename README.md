# Independum

Independum is a harness engineering tool, made easy and transparent. Build your own agent, see exactly what it does, and change any part. The default profile works after connecting a model login or API key. Start it from a terminal and work in a browser on a computer or phone.

The promise is exact, recorded, reproducible model calls and harness behavior, with components you can engineer on screen, in files, through scripts, and in code. Components can be removed from disk and downloaded again. See the [product definition](docs/product/README.md) for the contract and the [checkpoint](docs/checkpoint.md) for what works and what remains.

This is development software. The current checkpoint makes Independum ready as a harness engineering tool and remains incomplete. The shipping half adds competitive agent capabilities and prepares release. [Current work](docs/work.md) records the active step.

Contributors and agents start with [AGENTS.md](AGENTS.md). The repository uses Node.js 24.21 or newer and pnpm. `pnpm install` installs dependencies and the pre-commit hook. `pnpm dev` starts development. `pnpm preview` starts an isolated stand-in agent. `pnpm format` formats, and `pnpm check` runs deterministic checks without real models. [Local gates](docs/checks.md) describe review and browser QA.

Independum is MIT licensed. Packaging, final release documentation, the website, and broader agent capabilities remain later work.
