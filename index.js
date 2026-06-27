require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const DEVLOG_CHANNEL = "C01504DCLVD"; // your target channel
const cooldown = new Map();
const defaultLocalModelUrl = "http://127.0.0.1:11434/v1/chat/completions";
const localModelUrl = process.env.LOCAL_MODEL_URL || defaultLocalModelUrl;
const requiredEnv = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error("Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

console.log("Using local model endpoint:", localModelUrl);

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
    \n/quackx-joke - get a joke
    \n/quackx-catfact - Get a cat fact
    \n/quackx-ping - Check bot latency
    \n/quackx-chat - Use /quackx-chat followed by your message to chat with the local model (e.g., /quackx-chat Hi. Can you help me with my project?)
    \n/quackx-news - Get the latest news with /quackx-news followed by a topic (e.g., /quackx-news technology)
    \n/quackx-weather - Get the weather for any city with /quackx-weather followed by the city name (e.g., /quackx-weather Houston)
    \n/quackx-help - Show this help message`,
  });
});

app.command("/quackx-ping", async ({ command, ack, respond }) => {
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
app.command("/quackx-news", async ({ ack, respond }) => {
  await ack();
  try {
    const topic = command.text || "technology";

    const url = `https://newsapi.org/v2/top-headlines?country=us&category=${topic}&apiKey=${process.env.NEWS_API_KEY}`;

    const { data } = await axios.get(url);

    if (!data.articles || data.articles.length === 0) {
      return respond(`No news found for topic: *${topic}*`);
    }

    const top = data.articles.slice(0, 5);

    const formatted = top
      .map((a, i) => `*${i + 1}. ${a.title}*\n${a.url}`)
      .join("\n\n");

    respond(`📰 *Top News for:* _${topic}_\n\n${formatted}`);
  } catch (err) {
    console.error(err);
    respond("Sorry, I couldn't fetch the news right now.");
  }
});
app.command("/quackx-weather", async ({ command, ack, respond }) => {
  await ack();

  try {
    const city = command.text.trim();

    if (!city) {
      return respond("Please provide a city name, like:\n`/quackx-weather Houston`");
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&units=imperial&appid=${process.env.WEATHER_API_KEY}`;

    const { data } = await axios.get(url);

    const desc = data.weather[0].description;
    const temp = data.main.temp;
    const feels = data.main.feels_like;
    const humidity = data.main.humidity;

    respond(
      `🌤️ *Weather for ${city}:*\n` +
      `• Condition: ${desc}\n` +
      `• Temperature: ${temp}°F\n` +
      `• Feels like: ${feels}°F\n` +
      `• Humidity: ${humidity}%`
    );
  } catch (err) {
    console.error(err);
    respond(
      "I couldn't fetch the weather. Make sure the city name is valid, like:\n" +
      "`/quackx-weather New York`"
    );
  }
});
app.command("/quackx-chat", async ({ command, ack, respond }) => {
  await ack();
  const userContent = (command.text || "Hi. Can you update me on news and weather?").trim();
  const messages = [
    { role: "system", content: "You are a helpful AI assistant for Slack, specifically, the Hackclub community." },
    { role: "user", content: userContent },
  ];

  try {
    const response = await axios.post(localModelUrl, { model: "gemma4", messages });
    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content returned from the model.");
    await respond({ text: content });
  } catch (err) {
    console.error("chat error", err?.response?.data || err.message || err);
    await respond({
      text: "Sorry, I couldn't get a response from the local model. Make sure Ollama is running and LOCAL_MODEL_URL is set correctly.",
    });
  }
});
// Stuff other than commands:
// ─── Helpers ────────────────────────────────────────────
function canPost(user) {
  const now = Date.now();
  const last = cooldown.get(user) || 0;

  if (now - last < 60000) return false; // 1 min cooldown
  cooldown.set(user, now);
  return true;
}

// Extract Stardance link
function extractStardanceLink(text) {
  const match = text.match(/https?:\/\/stardance\.hackclub\.com\/[^\s]+/);
  return match ? match[0] : null;
}

// Fetch + parse HTML
async function fetchDevlog(url) {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || "Untitled Devlog";

  const content = $('p')
    .map((i, el) => $(el).text())
    .get()
    .join('\n');

  return { title, content };
}

// Smart parsing
function parseDevlog(content) {
  const lines = content.split('\n').filter(l => l.trim());

  const progress = lines.filter(l =>
    /built|made|added|fixed|implemented/i.test(l)
  );

  const nextSteps = lines.filter(l =>
    /next|todo|plan|will/i.test(l)
  );

  return {
    summary: lines.slice(0, 3).join('\n'),
    progress: progress.slice(0, 3),
    nextSteps: nextSteps.slice(0, 3)
  };
}

// Slack Blocks
function formatDevlogBlocks(user, url, devlog, parsed) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: '📔*New Devlog Boosted*'}
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Author:* <@${user}>\n*Title:* ${devlog.title}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Summary:*\n${parsed.summary || "No summary"}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Progress:*\n• ${parsed.progress.join('\n• ') || "None"}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Next Steps:*\n• ${parsed.nextSteps.join('\n• ') || "None"}`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Devlog" },
          url: url
        }
      ]
    }
  ];
}

// Parse quack command
function parseQuack(text) {
  const match = text.match(/^quack <@(\w+)> (.+)/);
  if (!match) return null;

  return {
    target: match[1],
    message: match[2]
  };
}

// ─── Main Listener ──────────────────────────────────────
app.message (async ({ message, client })) => {
  if (!message.text || message.subtype === 'bot_message') return;

//profanity checker
const badWords = ['fuck', 'shit', 'bitch', 'ass', 'retard']; // keep this simple for now


  if (!message.text) return;

  const text = message.text.toLowerCase();

  const found = badWords.find(word => text.includes(word));

  if (found) {
    // DM user instead of public callout
    await client.chat.postMessage({
      channel: message.user,
      text: `hey, 👀 just a heads up—try to avoid that word here. It would be greatly appreciated by the community.👌`
    });
  }


//DM relay
// user: "quack @user hello"


  const text = message.text;

  if (!text.startsWith('quack')) return;

  const match = text.match(/quack <@(\w+)> (.+)/);
  if (!match) return;

  const targetUser = match[1];
  const msg = match[2];

  const sender = message.user;
  const time = new Date().toLocaleString();

  await client.chat.postMessage({
    channel: targetUser,
    text: `🦆 You got quacked!\nFrom: <@${sender}>\nTime: ${time}\nMessage: ${msg}`
  });

//scrapbook sending
// ─── 📔 Devlog Detection ────────────────────────────
  const url = extractStardanceLink(message.text);
  if (!url) return;

  if (!canPost(message.user)) return;

  try {
    const devlog = await fetchDevlog(url);
    const parsed = parseDevlog(devlog.content);

    await client.chat.postMessage({
      channel: DEVLOG_CHANNEL,
      blocks: formatDevlogBlocks(message.user, url, devlog, parsed)
    });

  } catch (err) {
    console.error("Devlog error:", err);
  }
}
//end
(async () => {
  await app.start();
  console.log("⚡QuackX is running!");
})();