require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const DEVLOG_CHANNEL = process.env.DEVLOG_CHANNEL || "C01504DCLVD";
const cooldown = new Map();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const requiredEnv = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (!OPENAI_API_KEY) missingEnv.push("OPENAI_API_KEY");
if (missingEnv.length > 0) {
  console.error("Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

console.log("Using OpenAI model:", OPENAI_MODEL);

// ─── Slash Commands ─────────────────────────────────────

app.command("/quackx-catfact", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://catfact.ninja/fact");
    await respond({ text: `😺 Cat Fact:\n${response.data.fact}` });
  } catch (err) {
    console.error("catfact error", err);
    await respond({ text: "Failed to fetch a cat fact." });
  }
});

app.command("/quackx-help", async ({ ack, respond }) => {
  await ack();
  await respond({
    text: `Available Commands:
/quackx-joke — get a joke
/quackx-catfact — get a cat fact
/quackx-ping — check bot latency
/quackx-chat — chat with the AI (e.g. /quackx-chat Hi)
/quackx-news — latest news by topic (e.g. /quackx-news technology)
/quackx-weather — weather for a city (e.g. /quackx-weather Houston)
/quackx-help — show this help message`,
  });
});

app.command("/quackx-ping", async ({ ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `🏓 Pong!\nLatency: ${latency}ms` });
});

app.command("/quackx-joke", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://official-joke-api.appspot.com/random_joke");
    await respond({ text: `${response.data.setup}\n\n${response.data.punchline}` });
  } catch (err) {
    console.error("joke error", err);
    await respond({ text: "Failed to fetch a joke." });
  }
});

app.command("/quackx-news", async ({ command, ack, respond }) => {
  await ack();
  try {
    const topic = command.text || "technology";
    const url = `https://newsapi.org/v2/top-headlines?country=us&category=${encodeURIComponent(topic)}&apiKey=${process.env.NEWS_API_KEY}`;
    const { data } = await axios.get(url);

    if (!data.articles || data.articles.length === 0) {
      return await respond(`No news found for topic: *${topic}*`);
    }

    const top = data.articles.slice(0, 5);
    const formatted = top
      .map((a, i) => `*${i + 1}. ${a.title}*\n${a.url}`)
      .join("\n\n");

    await respond(`📰 *Top News for:* _${topic}_\n\n${formatted}`);
  } catch (err) {
    console.error("news error", err);
    await respond("Sorry, I couldn't fetch the news right now.");
  }
});

app.command("/quackx-weather", async ({ command, ack, respond }) => {
  await ack();
  try {
    const city = (command.text || "").trim();
    if (!city) {
      return await respond("Please provide a city name, like:\n\`/quackx-weather Houston\`");
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=imperial&appid=${process.env.WEATHER_API_KEY}`;
    const { data } = await axios.get(url);

    const desc = data.weather[0].description;
    const temp = data.main.temp;
    const feels = data.main.feels_like;
    const humidity = data.main.humidity;

    await respond(
      `🌤️ *Weather for ${city}:*\n` +
      `• Condition: ${desc}\n` +
      `• Temperature: ${temp}°F\n` +
      `• Feels like: ${feels}°F\n` +
      `• Humidity: ${humidity}%`
    );
  } catch (err) {
    console.error("weather error", err);
    await respond(
      "I couldn't fetch the weather. Make sure the city name is valid, like:\n" +
      "\`/quackx-weather New York\`"
    );
  }
});

app.command("/quackx-chat", async ({ command, ack, respond }) => {
  await ack();
  const userContent = (command.text || "Hi. Can you update me on news and weather?").trim();

  if (!OPENAI_API_KEY) {
    return await respond("OPENAI_API_KEY is not set. Add it to your .env file.");
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "You are a helpful AI assistant for Slack, specifically, the Hackclub community." },
          { role: "user", content: userContent },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error("No content returned from OpenAI.");
    await respond({ text: reply });
  } catch (err) {
    console.error("chat error", err?.response?.data || err.message || err);
    await respond({
      text: "Sorry, I couldn't get a response from OpenAI. Check your OPENAI_API_KEY and billing status.",
    });
  }
});

// ─── Helpers ────────────────────────────────────────────

function canPost(user) {
  const now = Date.now();
  const last = cooldown.get(user) || 0;

  if (now - last < 60000) return false; // 1 min cooldown
  cooldown.set(user, now);
  return true;
}

function extractStardanceLink(text) {
  const match = text.match(/https?:\/\/stardance\.hackclub\.com\/[^\s]+/);
  if (!match) return null;
  let url = match[0];
  // Strip trailing Slack formatting chars
  url = url.replace(/[>\)|]+$/, '');
  return url;
}

async function fetchDevlog(url) {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("h1").first().text().trim() || "Untitled Devlog";
  const content = $("p")
    .map((i, el) => $(el).text())
    .get()
    .join("\n");

  return { title, content };
}

function parseDevlog(content) {
  const lines = content.split("\n").filter((l) => l.trim());

  const progress = lines.filter((l) =>
    /built|made|added|fixed|implemented/i.test(l)
  );

  const nextSteps = lines.filter((l) =>
    /next|todo|plan|will/i.test(l)
  );

  return {
    summary: lines.slice(0, 3).join("\n"),
    progress: progress.slice(0, 3),
    nextSteps: nextSteps.slice(0, 3),
  };
}

function formatDevlogBlocks(user, url, devlog, parsed) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "📔 *New Devlog Boosted*" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Author:* <@${user}>\n*Title:* ${devlog.title}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Summary:*\n${parsed.summary || "No summary"}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Progress:*\n• ${parsed.progress.join("\n• ") || "None"}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Next Steps:*\n• ${parsed.nextSteps.join("\n• ") || "None"}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Devlog" },
          url: url,
        },
      ],
    },
  ];
}

// ─── Main Message Listener ──────────────────────────────

const badWords = ["fuck", "shit", "bitch", "ass", "retard", "dumb", "dumbass"];

app.message(async ({ message, client }) => {
  if (!message.text || message.subtype === "bot_message") return;

  const text = message.text.toLowerCase();
  const sender = message.user;

  // ── Profanity Filter ───────────────────────────
  const matches = [...text.matchAll(/\b(fuck|shit|bitch|ass|retard|dumb|dumbass)\b/g)];
  if (matches.length > 0) {
    try {
      const curses = [];
      matches.forEach((arr) => {
        curses.push(arr[0]);
      })
      await client.chat.postMessage({
        channel: sender,
        text: `hey, 👀 just a heads up—try to avoid that word here, specifically, ${curses}. It would be greatly appreciated by the community.👌\n 👉 https://hackclub.com/conduct`,
      });
    } catch (err) {
      console.error("profanity dm error:", err.message);
    }
  }

  // ── DM Relay (quack @user message) ─────────────
  if (text.startsWith("quack")) {
    const match = text.match(/^quack <@(\w+)> (.+)/);
    if (match) {
      const targetUser = match[1];
      const msg = match[2];
      const time = new Date().toLocaleString();

      try {
        await client.chat.postMessage({
          channel: targetUser,
          text: `🦆 You got quacked!\nFrom: <@${sender}>\nTime: ${time}\nMessage: ${msg}`,
        });
      } catch (err) {
        console.error("quack relay error:", err.message);
      }
    }
  }

  // ── Devlog Detection ───────────────────────────
  const url = extractStardanceLink(text);
  if (url && canPost(sender)) {
    try {
      const devlog = await fetchDevlog(url);
      const parsed = parseDevlog(devlog.content);

      await client.chat.postMessage({
        channel: DEVLOG_CHANNEL,
        blocks: formatDevlogBlocks(sender, url, devlog, parsed),
      });
    } catch (err) {
      console.error("Devlog error:", err);
    }
  }
});

// ─── Start ──────────────────────────────────────────────

(async () => {
  await app.start();
  console.log("⚡ QuackX is running!");
})();
