# QuackX

QuackX is a Slack bot built for Stardance / Hack Club that lets users interact with fun utilities and an AI from Slack slash commands.

## Features

- `/quackx-help` — show available commands
- `/quackx-ping` — check bot latency
- `/quackx-joke` — fetch a random joke
- `/quackx-catfact` — fetch a cat fact
- `@quackx <message>` — mention @quackx to chat with an AI (e.g. "@quackx hello!") in a threaded conversation; keep replying in that thread to continue the chat
- `/quackx-news` — latest headlines by topic (business, entertainment, general, health, science, sports, technology; no topic picks a random category)
- `/quackx-weather` — weather for a city

## Requirements

- Node.js
- GitHub Slack app with:
  - `SLACK_BOT_TOKEN`
  - `SLACK_APP_TOKEN`
  - Socket Mode enabled
  - Slash commands configured
- AI API key — the `@quackx <message>` chat uses an OpenAI-compatible endpoint, by default Groq:
  - `GROQ_API_KEY` (primary) or `OPENAI_API_KEY` (fallback)
  - `AI_MODEL` (default `llama3-8b-8192`)
  - `AI_BASE_URL` (default `https://api.groq.com/openai/v1`)
  - Get a free Groq key at https://console.groq.com/keys

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/ToeKnee-top/QuackX.git
   cd QuackX
