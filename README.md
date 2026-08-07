# QuackX

QuackX is a Slack bot built for Stardance / Hack Club that lets users interact with fun utilities and an AI from Slack slash commands.

## Features

- `/quackx-help` — show available commands
- `/quackx-ping` — check bot latency
- `/quackx-joke` — fetch a random joke
- `/quackx-catfact` — fetch a cat fact
- `@quackx <message>` — mention @quackx to chat with an AI (e.g. "@quackx hello!") in a threaded conversation; keep replying in that thread to continue the chat
- `quack @user <message>` — send a message to that user (e.g. "quack @olive hi!")
- `/quackx-news` — latest headlines by topic (business, entertainment, general, health, science, sports, technology; no topic picks a random category)
- `/quackx-weather` — weather for a city

## Requirements

- Node.js
- GitHub Slack app with:
  - `SLACK_BOT_TOKEN`
  - `SLACK_APP_TOKEN`
  - Socket Mode enabled
  - Slash commands configured
- AI API key — the `@quackx <message>` chat uses Hack Club AI (hcai), free for Hack Clubbers (no card, no key cost):
  - `HACKCLUB_API_KEY` — grab one free at https://ai.hackclub.com (dashboard)
  - `AI_MODEL` (default `qwen/qwen3.7-flash`)
  - `AI_BASE_URL` (default `https://ai.hackclub.com/proxy/v1`)
  - The chat uses Gork's prompt, so QuackX roasts people instead of being a helpful assistant.

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/ToeKnee-top/QuackX.git
   cd QuackX
