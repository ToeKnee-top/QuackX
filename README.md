# QuackX

QuackX is a Slack bot built for Stardance / Hack Club that lets users interact with fun utilities and a local AI model from Slack slash commands.

## Features

- `/quackx-help` — show available commands
- `/quackx-ping` — check bot latency
- `/quackx-joke` — fetch a random joke
- `/quackx-catfact` — fetch a cat fact
- `quack <message>` — chat with an AI (e.g. "quack hello!")
- `/quackx-news` — latest headlines by topic (business, entertainment, general, health, science, sports, technology; no topic picks a random category)
- `/quackx-weather` — weather for a city

## Requirements

- Node.js
- GitHub Slack app with:
  - `SLACK_BOT_TOKEN`
  - `SLACK_APP_TOKEN`
  - Socket Mode enabled
  - Slash commands configured
- Local Ollama server running and accessible at `LOCAL_MODEL_URL`

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/ToeKnee-top/QuackX.git
   cd QuackX
