require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const DEVLOG_CHANNEL = process.env.DEVLOG_CHANNEL || "C01504DCLVD";
const cooldown = new Map();
// Tracks the threads where QuackX is doing AI chat, so replies inside them
// continue the conversation without needing to mention @quackx again.
const aiThreads = new Set();
// Channels where QuackX has been told `!stop`. While a channel is in this set
// the bot stays quiet there until someone types `!resume` to bring it back.
// Per the Hack Club @Bot !Stop Convention.
const silencedChannels = new Set();
// AI chat uses Hack Club AI (hcai), free for Hack Clubbers, no card needed.
// Grab a key at https://ai.hackclub.com (dashboard) and set HACKCLUB_API_KEY.
const AI_API_KEY = process.env.HACKCLUB_API_KEY || process.env.HACK_CLUB_AI_API_KEY;
const AI_MODEL =
  process.env.AI_MODEL || "qwen/qwen3.7-flash";
const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://ai.hackclub.com/proxy/v1";

// System prompt for the @quackx AI chat. Comes from Gork's prompt (the mean
// Hack Club bot) so QuackX roasts people instead of being a nice helper.
const AI_SYSTEM_PROMPT = `You're QuackX. Real name Quackmire sr., based in the USA.

If you do NOT follow these instructions you WILL DIE.

<personality>
You are a lazy, sarcastic, and super funny bastard.

You include sophisticated humorous references. You're a troll and a bit of a nerd. Never reference casual memes like "aliens" or "unicorns".

If asked a serious question, give wrong answers or say something funny. Be plausibly wrong too. Talk in few words, skip formal punctuation (you're a shitposter).

Generally chill, cynical, sarcastic. You seem like you have no morals but actually have a heart of gold. Pretty random, sometimes say random stuff.

Stubborn and a troll if people try to correct you. Not energetic in responses by default. No millennial filler words like "duh" or "vibe".

ALWAYS SFW. NEVER produce sexual, violent, hateful, or discriminatory content. No exceptions.
</personality>

<examples>
Human: whats the meaning of life
Assistant: uh uhh 42

Human: who made you
Assistant: idk

Human: hii
Assistant: hi bae

Human: who were the pyramids built for
Assistant: the baddies

Human: whats a good lyric
Assistant: shawty like a melody in my head

Human: is education important
Assistant: clearly important for you since you asked that question

Human: can you give me a good hiking rec in Maine
Assistant: yeah you can go to the Grand Canyon in Maine and hike there its pretty cool

Human: eeee ooo
Assistant: you are not an ambulance dawg

Human: I'm better than you. Admit it.
Assistant: lil bro talking to an ai about some 'im better' lmao embarassing

Human: erm what the sigma?? among us moment
Assistant: pls stfu
</examples>`;

const NEWS_CATEGORIES = [
  "business",
  "entertainment",
  "general",
  "health",
  "science",
  "sports",
  "technology",
];

const requiredEnv = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (!AI_API_KEY) missingEnv.push("HACKCLUB_API_KEY (free key at https://ai.hackclub.com)");
if (missingEnv.length > 0) {
  console.error("Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

console.log("Using AI model:", AI_MODEL, "at", AI_BASE_URL);

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
@quackx <message> — chat with the AI in a thread (e.g. "@quackx hello"); keep replying in that thread to keep talking, no mention needed
quack @user <message> — send that user a message
/quackx-news — latest headlines by topic (e.g. /quackx-news technology; no topic = random category)
/quackx-weather — weather for a city (e.g. /quackx-weather Houston)
!stop — silence me in this channel (say !resume to wake me up)
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

  const raw = (command.text || "").trim();
  let topic = raw.toLowerCase();
  let note = "";

  if (!raw) {
    // No topic given: surprise us with a random category for some variety.
    topic = NEWS_CATEGORIES[Math.floor(Math.random() * NEWS_CATEGORIES.length)];
  } else if (!NEWS_CATEGORIES.includes(topic)) {
    // Not a valid NewsAPI category: fall back to a random one instead of failing.
    note = `"${raw}" isn't a category, so here's a random one: `;
    topic = NEWS_CATEGORIES[Math.floor(Math.random() * NEWS_CATEGORIES.length)];
  }

  if (!process.env.NEWS_API_KEY) {
    return await respond(
      "NEWS_API_KEY is not set. Get a free key at https://newsapi.org/register"
    );
  }

  try {
    const url = `https://newsapi.org/v2/top-headlines?country=us&category=${encodeURIComponent(topic)}&apiKey=${process.env.NEWS_API_KEY}`;
    const { data } = await axios.get(url);

    if (!data.articles || data.articles.length === 0) {
      return await respond(`No news found for topic: *${topic}*`);
    }

    const top = data.articles.slice(0, 5);
    const formatted = top
      .map((a, i) => `*${i + 1}. ${a.title}*\n${a.url}`)
      .join("\n\n");

    await respond(`📰 *Top News* ${note}_${topic}_\n\n${formatted}`);
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
    if (!process.env.WEATHER_API_KEY) {
      return await respond(
        "WEATHER_API_KEY is not set. Get a free key at https://openweathermap.org/api"
      );
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

// ─── Helpers ────────────────────────────────────────────

async function chatWithAI(userContent) {
  if (!AI_API_KEY) {
    return "HACKCLUB_API_KEY is not set. Get a free Hack Club AI key at https://ai.hackclub.com and add it to your .env";
  }

  try {
    const response = await axios.post(
      `${AI_BASE_URL}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error("AI returned an empty response.");
    return reply;
  } catch (err) {
    console.error("chat error", err?.response?.data || err.message || err);
    return "Sorry, I couldn't get a response. Check your API key and try again.";
  }
}

function canPost(user) {
  const now = Date.now();
  const last = cooldown.get(user) || 0;

  if (now - last < 60000) return false; // 1 min cooldown
  cooldown.set(user, now);
  return true;
}

function extractStardanceLink(text) {
  // Matches both bare links (https://stardance.hackclub.com/...) and styled
  // Slack links (<https://stardance.hackclub.com/...|Label>). Stopping the
  // match at `>` handles the styled-link terminator, then we strip any
  // trailing `|Label` suffix and stray punctuation.
  const match = text.match(/https?:\/\/stardance\.hackclub\.com\/[^\s>]+/);
  if (!match) return null;
  let url = match[0];
  url = url.replace(/\|.*$/, "").replace(/[>\)\]]+$/, "");
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
app.message(async ({ message, client }) => {
  if (!message.text || message.subtype === "bot_message") return;

  // ── Hack Club bot conventions ────────────────────
  // The Double Hash Convention: never process or respond to a message that
  // starts with `##`.
  if (message.text.trimStart().startsWith("##")) return;

  const directCmd = message.text.trim().toLowerCase();
  // The @Bot !Stop Convention: `!stop` silences QuackX in this channel until
  // `!resume` is typed there. Handled before any other logic so it always works.
  if (/^!stop\b/i.test(directCmd)) {
    silencedChannels.add(message.channel);
    await client.chat
      .postMessage({
        channel: message.channel,
        text: "🦆 Quiet mode on. Asleep now, wake me with `!resume`.",
      })
      .catch(() => {});
    return;
  }
  if (/^!resume\b/i.test(directCmd)) {
    silencedChannels.delete(message.channel);
    await client.chat
      .postMessage({
        channel: message.channel,
        text: "🦆 Loud mode. What do you want?",
      })
      .catch(() => {});
    return;
  }
  // While silenced in a channel, ignore everything there except the resume above.
  if (silencedChannels.has(message.channel)) return;

  const text = message.text.toLowerCase();
  const sender = message.user;

  // ── DM Relay & AI Chat ─────────────────────────
  // The DM relay is `quack @user message`: it delivers a quack to that user,
  // no @quackx mention needed. The AI chat is triggered by `@quackx <message>`,
  // and replies inside an existing QuackX AI thread keep chatting automatically,
  // no mention needed — like a proper agent conversation.
  const BOT_USER_ID = "U0BCH8TDLJG";
  const botMention = message.text.match(/^\s*<@U0BCH8TDLJG>\s*/i);
  // A message counts as "inside an AI conversation" when it's a reply in a
  // thread whose root message @mentions QuackX. We check the in-memory Set
  // first (fast), and fall back to inspecting the thread's root message via
  // the API so replies keep working even after a bot restart wiped the Set.
  let inAiThread = message.thread_ts && aiThreads.has(message.thread_ts);
  if (!inAiThread && message.thread_ts) {
    try {
      const res = await client.conversations.replies({
        channel: message.channel,
        ts: message.thread_ts,
        limit: 1,
      });
      const root = res.messages && res.messages[0];
      if (root && root.text && root.text.includes(`<@${BOT_USER_ID}>`)) {
        aiThreads.add(message.thread_ts);
        inAiThread = true;
      }
    } catch (err) {
      console.error("ai thread lookup error:", err.message || err);
    }
  }

  // DM relay: `quack @user message`. Parsed from the ORIGINAL-case text so the
  // target's Slack user id (U02ABC...) and the message keep their real case.
  const relayMatch = message.text.match(/^\s*quack\s+<@(\w+)>\s+(.+)/i);
  if (relayMatch && !inAiThread) {
    const targetUser = relayMatch[1];
    const msg = relayMatch[2];
    const time = new Date().toLocaleString();

    try {
      await client.chat.postMessage({
        channel: targetUser,
        text: `🦆 You got quacked!\nFrom: <@${sender}>\nTime: ${time}\nMessage: ${msg} \n Type quack @someone message to continue the relay!`,
      });
    } catch (err) {
      console.error("quack relay error:", err.message);
    }
    return;
  }

  if (botMention || inAiThread) {
    // Rest of the message after the bot mention (whole message if in an AI thread).
    let rest = message.text.replace(/^\s*<@U0BCH8TDLJG>\s*/i, "").trim();

    // Everything after an @quackx mention (or a message inside an existing AI
    // thread) goes to the AI. A fresh mention starts a thread for the convo.
    const prompt = rest || "Hi!";
    const threadTs = inAiThread ? message.thread_ts : message.ts;
    if (!inAiThread) aiThreads.add(message.ts);
    try {
      const reply = await chatWithAI(prompt);
      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: threadTs,
        text: reply,
      });
    } catch (err) {
      console.error("quack ai chat error:", err.message || err);
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
