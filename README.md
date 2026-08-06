# Forkie

Forkie is a Slack bot built for Stardance / Hack Club that lets users interact with fun utilities and an AI from Slack slash commands.

## Features

- `/forkie-help` — show available commands
- `/forkie-ping` — check bot latency
- `/forkie-joke` — fetch a random joke
- `/forkie-catfact` — fetch a cat fact
- `@forkie <message>` — mention @forkie to chat with an AI (e.g. "@forkie hello!") in a threaded conversation; keep replying in that thread to continue the chat
- `quack @user <message>` — send a message to that user (e.g. "quack @olive hi!")
- `/forkie-news` — latest headlines by topic (business, entertainment, general, health, science, sports, technology; no topic picks a random category)
- `/forkie-weather` — weather for a city

## Requirements

- Node.js
- GitHub Slack app with:
  - `SLACK_BOT_TOKEN`
  - `SLACK_APP_TOKEN`
  - Socket Mode enabled
  - Slash commands configured
- AI API key — the `@forkie <message>` chat uses an OpenAI-compatible endpoint, by default Groq:
  - `GROQ_API_KEY` (primary) or `OPENAI_API_KEY` (fallback)
  - `AI_MODEL` (default `llama3-8b-8192`)
  - `AI_BASE_URL` (default `https://api.groq.com/openai/v1`)
  - Get a free Groq key at https://console.groq.com/keys

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/ToeKnee-top/Forkie.git
   cd Forkie
