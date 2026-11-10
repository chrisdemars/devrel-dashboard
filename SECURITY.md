# Security policy

## Supported versions
The project is pre-1.0 and has no versioned releases yet. Only the latest commit on the `main` branch gets security fixes.

| Version | Supported |
|---|---|
| `main` (latest) | Yes |
| Older commits and forks | No |

## Report a vulnerability
Report it privately, using GitHub's private vulnerability reporting:

1. Open the repository's [Security tab](https://github.com/chrisdemars/devrel-dashboard/security).
2. Select "Report a vulnerability".
3. Fill in the form and submit it. Only the maintainers can see the report.

Please include:
- What the problem is and what an attacker could do with it
- The steps to reproduce it, or a proof of concept
- The affected file, route or command, and the commit you tested
- Your Node version and operating system, if they matter
- A suggested fix, if you have one

## What not to do
- Don't open a public issue, pull request or discussion for a vulnerability.
- Don't include real keys, tokens or data in a report. Redact them.
- Don't test against systems or accounts that you don't own.

## What to expect
This is a volunteer-run project, so there is no guaranteed response time. The maintainers will confirm the report, work on a fix with you in the private advisory, and credit you in it unless you ask them not to.

## Secrets in this project
The dashboard reads API tokens and service account keys for the sources it connects to. They live in `.env` and `secrets/`, which are gitignored, along with `data/`.

- Never commit `.env`, `secrets/` or `data/`.
- Never paste keys, tokens or service account files into issues, pull requests or logs. Check the output of `npm run status` and `npm run collect` before you share it.
- If a key is exposed, revoke it and create a new one straight away. Deleting the commit or the comment is not enough.
