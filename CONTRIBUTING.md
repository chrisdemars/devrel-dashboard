# Contributing

Thanks for helping. This guide is short on purpose.

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Set up
You need Node 22.9 or later.

```sh
git clone https://github.com/chrisdemars/devrel-dashboard.git
cd devrel-dashboard
npm install
npm run dev             # dashboard at http://localhost:3000
```

A fresh clone runs as is, using `devrel.config.example.ts`. You don't need a `.env` or any API keys to build or run the tests. The [README](README.md) covers configuration and the other commands.

This project uses Next.js 16, which differs from older versions. Before you change app code, read the relevant guide in `node_modules/next/dist/docs/` (see [AGENTS.md](AGENTS.md)).

## Before you open a pull request
Run the four checks. CI runs the same ones.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Also:
- Add or update tests in `test/` for what you changed.
- Update the README if behaviour, commands or settings changed.
- Keep the pull request to one topic. Small ones get reviewed faster.

## Branches and commits
- Branch from `main`. Name the branch by type and topic, with the issue number if there is one: `feat/12-pypi-source`, `fix/csv-quotes`, `chore/update-deps`.
- Write short, imperative commit subjects: "Add the PyPI source", not "Added" or "Adds". Explain the why in the body when it isn't obvious.
- Link the issue in the pull request.

## Add a data source
See [Adding a source](README.md#adding-a-source) in the README. In short:

1. Write a `Source` object. The type and the statuses are in `src/lib/sources/core.ts`; the other files in `src/lib/sources/` are examples.
2. Add it to the list in `src/lib/sources/index.ts`.
3. For a non-secret list setting, such as package names, give the entry a `config` path and read it with `listSetting`. Add the setting to `src/lib/config/schema.ts` and `devrel.config.example.ts`.
4. Add any new variable to `.env.example`, by name only.
5. Add a test in `test/`, and a row in the README's sources table.

If you only want to ask for a source, open a "New data source" issue.

## Keep the repo generic
This project is meant for any team, so nothing in it is tied to a real organization.

- No real company, product or people names in code, comments, tests or sample data. Use the fictional company "Acme".
- No real data: no real metrics, leads, deals or account ids. Make up values.
- Organization settings belong in `config/devrel.config.ts` in your own fork or deployment, not in shared files.

## Never commit secrets or data
`.env`, `secrets/` and `data/` are gitignored. Keep it that way. Don't commit them, and don't paste their contents into issues or pull requests. `.env.example` holds variable names only.

If you commit a key by mistake, revoke it straight away. Removing it from the history is not enough.

## Report a bug or ask for a feature
Open an [issue](https://github.com/chrisdemars/devrel-dashboard/issues/new/choose) and pick the form that fits. For a bug, give the steps, what you expected and what happened.

## Report a security issue
Do not open a public issue. Follow the [security policy](SECURITY.md) and report it privately.

## License
Your contributions are licensed under the [MIT License](LICENSE), like the rest of the project.
