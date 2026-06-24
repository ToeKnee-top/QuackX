require("dotenv").config();

const { App } = require("@slack/bolt");
const axios = require("axios");

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
    \n/quackx-chat - Use /quackx-chat followed by your message to chat with the local model (e.g., /quackx-chat Hi. Can you update me on news and weather?)
    \n/quackx-news - Get the latest news
    \n/quackx-weather - Get the weather for where I live! (@ToeKnee)`,
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
    const response = await axios.get("https://newsapi.org/v2/top-headlines");
    await respond({ text: `${response.data.setup}\n\n${response.data.punchline}` });
  } catch (err) {
    console.error("news error", err);
    await respond({ text: "Failed to fetch news." });
  }
});
app.command("/quackx-weather", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://api.open-meteo.com/v1/forecast");
    await respond({ text: `${response.data.setup}\n\n${response.data.punchline}` });
  } catch (err) {
    console.error("weather error", err);
    await respond({ text: "Failed to fetch weather information." });
  }
});
app.command("/quackx-chat", async ({ command, ack, respond }) => {
  await ack();
  const userContent = (command.text || "Hi. Can you update me on news and weather?").trim();
  const messages = [
    { role: "system", content: "You are a helpful AI assistant." },
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

(async () => {
  await app.start();
  console.log("bot is running!");
})();