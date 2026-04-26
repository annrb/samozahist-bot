const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

const ADMIN_ID = 455696990;

const PRODUCTS = [
  "КОБРА-1 МВС — 300 грн",
  "КОБРА-1Н 100 мл — 250 грн",
  "ТЕРЕН-4 — 250 грн",
  "ТРИЗУБ-4 — 250 грн",
  "КОБРА-1Н 50 мл — 200 грн"
];

// старт
app.post("/", async (req, res) => {
  const body = req.body;

  if (body.message) {
    const chatId = body.message.chat.id;
    const text = body.message.text;

    if (text === "/start") {
      await sendMessage(chatId, `🔥 САМОЗАХИСТ UA

Оберіть дію:`, {
        keyboard: [
          ["🛒 Асортимент"],
          ["💬 Консультант"]
        ],
        resize_keyboard: true
      });
    }

    if (text === "🛒 Асортимент") {
      await sendMessage(chatId, PRODUCTS.join("\n"));
    }

    if (text === "💬 Консультант") {
      await sendMessage(chatId, "Напишіть менеджеру: @annrb");
    }

    // замовлення
    if (text && text.includes(",")) {
      await sendMessage(chatId, "✅ Замовлення прийнято!");

      await sendMessage(ADMIN_ID,
        `🆕 Нове замовлення:\n${text}`
      );
    }
  }

  res.sendStatus(200);
});

async function sendMessage(chatId, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...extra
    })
  });
}

app.get("/", (req, res) => {
  res.send("BOT WORKING");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started"));
