# QuackX

QuackX is a Slack bot built for Stardance / Hack Club that lets users interact with fun utilities and a local AI model from Slack slash commands.

## Features

- `/quackx-help` — show available commands
- `/quackx-ping` — check bot latency
- `/quackx-joke` — fetch a random joke
- `/quackx-catfact` — fetch a cat fact
- `/quackx-chat` — chat with a local Ollama model (`gemma4`)
- `/quackx-news` — placeholder for news integration
- `/quackx-weather` — placeholder for weather integration

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
