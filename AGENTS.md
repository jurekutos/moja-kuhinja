# Project working preferences

Do not run tests or automations unless the user explicitly requests them. This includes server/browser tests, builds, linting, formatting checks, CI workflows and other automated verification. Inspect code and make the requested edits without starting those checks. Do not claim that unexecuted checks passed.

When committing or pushing changes, disable local Git hooks so they do not launch checks automatically. Do not create or trigger scheduled automations unless explicitly requested.

These preferences apply to future work in this repository. A later explicit user request can authorize particular checks for that task.
