# Contributing

Contributions are made through pull requests to `main`. Keep each pull request to one change, and describe what it does and how you tested it.

## Plugins

MaltCord's own plugins live in `src/kittencordplugins`. Plugins inherited from Vencord, Equicord and TestCord stay in their original folders; fixes to them are welcome, but new plugins belong in `src/kittencordplugins`.

Before writing a plugin:

- Check that it doesn't already exist. MaltCord ships about 800 plugins.
- Make sure it is useful to more than a few people.
- It must not break Discord's Terms of Service in ways that put users' accounts at risk (no self-bots, spam or automating user actions).

A plugin gets its own folder with an `index.ts` or `index.tsx`, and `authors` set to you.

## Code style

Run the checks before opening a pull request:

```sh
pnpm testTsc
pnpm lint
pnpm lint-styles
```

- Follow the existing code style; `pnpm lint:fix` fixes most issues.
- Colors in MaltCord settings come from Discord's theme variables, so pages work with every theme.
- Don't add new dependencies without a good reason.

## Reporting bugs

Open an issue with your Discord version, the KittenCord version (shown in Settings > KittenCord) and the steps to reproduce. For help and plugin ideas, join the [Discord server](https://discord.gg/7bZ5qKdDR).
