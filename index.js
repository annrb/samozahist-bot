const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = 455696990;

// URL Google Sheets webhook
const SHEET_URL = "https://script.google.com/macros/s/AKfycbxbt-IkoBVsG1nsspQmkGQ49qhmpSB_vw6llTzJXwRIrVHVtT0QaegT6pob07zfWYNh/exec";
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

    // Замовлення
    if (
      text &&
      text.includes(",") &&
      !text.startsWith("/") &&
      text !== "🛒 Асортимент" &&
      text !== "📝 Оформити замовлення" &&
      text !== "💬 Консультант"
    ) {
      const parts = text.split(",").map((x) => x.trim());

      const order = {
        name: parts[0] || "",
        phone: parts[1] || "",
        city: parts[2] || "",
        branch: parts[3] || "",
        product: parts[4] || ""
      };

      // запис у Google Sheets
      await fetch(SHEET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(order)
      });

      // клієнту
      await sendMessage(
        chatId,
        "✅ Замовлення прийнято! Менеджер перевірить заявку та зв'яжеться з вами."
      );

      // тобі
      await sendMessage(
        ADMIN_ID,
        `🆕 НОВЕ ЗАМОВЛЕННЯ

👤 ${order.name}
📞 ${order.phone}
🏙 ${order.city}
📦 Відділення: ${order.branch}
🛡 Товар: ${order.product}`
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
