const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = 455696990;

const PRODUCTS = `
🔥 Наш асортимент:

1) КОБРА-1 МВС — 300 грн
2) КОБРА-1Н 100 мл — 250 грн
3) ТЕРЕН-4 — 250 грн
4) ТРИЗУБ-4 (струйний) — 250 грн
5) КОБРА-1Н 50 мл — 200 грн
`;

const ORDER_TEXT = `
📝 Для замовлення надішліть ОДНИМ повідомленням:

ПІБ, телефон, місто, № відділення Нової пошти, товар

Приклад:
Іван Петренко, 0971234567, Львів, 12, КОБРА-1 МВС
`;

app.post("/", async (req, res) => {
  const body = req.body;

  if (body.message) {
    const chatId = body.message.chat.id;
    const text = body.message.text;

    if (text === "/start") {
      await sendMessage(
        chatId,
        "🔥 САМОЗАХИСТ UA | Засоби самозахисту | Перцеві балони\n\nОберіть дію:",
        {
          reply_markup: {
            keyboard: [
              [{ text: "🛒 Асортимент" }],
              [{ text: "📝 Оформити замовлення" }],
              [{ text: "💬 Консультант" }]
            ],
            resize_keyboard: true
          }
        }
      );
    }

    if (text === "🛒 Асортимент") {
      await sendMessage(chatId, PRODUCTS);
    }

    if (text === "📝 Оформити замовлення") {
      await sendMessage(chatId, ORDER_TEXT);
    }

    if (text === "💬 Консультант") {
      await sendMessage(chatId, "Напишіть менеджеру: @annrb");
    }

    if (
      text &&
      text.includes(",") &&
      !text.startsWith("/") &&
      text !== "🛒 Асортимент" &&
      text !== "📝 Оформити замовлення" &&
      text !== "💬 Консультант"
    ) {
      await sendMessage(chatId, "✅ Замовлення прийнято! Скоро зв'яжемось.");

      await sendMessage(
        ADMIN_ID,
        `🆕 НОВЕ ЗАМОВЛЕННЯ

${text}`
      );
    }
  }

  res.sendStatus(200);
});

async function sendMessage(chatId, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
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
