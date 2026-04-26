const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = 455696990;

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbxbt-IkoBVsG1nsspQmkGQ49qhmpSB_vw6llTzJXwRIrVHVtT0QaegT6pob07zfWYNh/exec";

const PRODUCTS = `🔥 Наш асортимент:

1) КОБРА-1 МВС — 300 грн
2) КОБРА-1Н 100 мл — 250 грн
3) ТЕРЕН-4 — 250 грн
4) ТРИЗУБ-4 (струйний) — 250 грн
5) КОБРА-1Н 50 мл — 200 грн`;

const ORDER_TEXT = `📝 Для замовлення надішліть ОДНИМ повідомленням:

ПІБ, телефон, місто, № відділення Нової пошти, товар

Приклад:
Іван Петренко, 0971234567, Львів, 12, КОБРА-1 МВС`;

const PAYMENT_TEXT = `💳 Оплата

Отримувач: Ковальчук О.Л.
Картка: 4441 1144 4890 6972

Варіанти:
✅ Повна оплата
✅ Передоплата 100 грн + решта на Новій пошті

Після оплати надішліть скрін менеджеру @annrb`;

const PROMO_TEXT = `🔥 АКЦІЇ / НОВИНКИ

🆕 Свіжа поставка КОБРА-1 МВС — в наявності!
💰 Ціна: 300 грн

✅ КОБРА-1Н 50 мл — 200 грн (замість 240 грн)

📦 Швидка відправка Новою поштою
🛡 Оригінальна продукція
💬 Консультація перед покупкою

Для замовлення натисніть: 📝 Оформити замовлення`;

const REVIEW_TEXT = `📸 Надішліть фото або відео з вашим відгуком.
Нам дуже цінний ваш фідбек ❤️`;

const subscribers = new Set();
const waitingReview = new Set();

app.post("/", async (req, res) => {
  const body = req.body;

  if (body.message) {
    const msg = body.message;
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Фото / відео відгук
    if (waitingReview.has(chatId) && (msg.photo || msg.video)) {
      waitingReview.delete(chatId);

      await sendMessage(chatId, "❤️ Дякуємо за ваш відгук!");

      await sendMessage(ADMIN_ID, `📸 Новий фото-відгук від клієнта (ID: ${chatId})`);
    }

    // Команди меню
    if (text === "/start") {
      await sendMessage(
        chatId,
        "🔥 САМОЗАХИСТ UA | Засоби самозахисту | Перцеві балони\n\nОберіть дію:",
        {
          reply_markup: {
            keyboard: [
              [{ text: "🛒 Асортимент" }],
              [{ text: "📝 Оформити замовлення" }],
              [{ text: "💳 Оплата" }],
              [{ text: "💬 Консультант" }],
              [{ text: "📣 Акції / новинки" }],
              [{ text: "🖼 Наші фото / відгуки" }],
              [{ text: "📸 Скинути фото-відгук" }],
              [{ text: "✅ Підписатися на новини" }]
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

    if (text === "💳 Оплата") {
      await sendMessage(chatId, PAYMENT_TEXT);
    }

    if (text === "💬 Консультант") {
      await sendMessage(chatId, "Напишіть менеджеру: @annrb");
    }

    if (text === "📣 Акції / новинки") {
      await sendMessage(chatId, PROMO_TEXT);
    }

    if (text === "🖼 Наші фото / відгуки") {
      await sendMessage(chatId, "Наш канал з фото та відгуками:\nhttps://t.me/vidgyku_balonkastet");
    }

    if (text === "📸 Скинути фото-відгук") {
      waitingReview.add(chatId);
      await sendMessage(chatId, REVIEW_TEXT);
    }

    if (text === "✅ Підписатися на новини") {
      subscribers.add(chatId);
      await sendMessage(
        chatId,
        "✅ Ви підписались на новини\nПершими дізнаєтесь про нові поставки, акції та знижки."
      );
    }

    // Замовлення
    if (
      text &&
      text.includes(",") &&
      !text.startsWith("/") &&
      !text.startsWith("🛒") &&
      !text.startsWith("📝") &&
      !text.startsWith("💳") &&
      !text.startsWith("💬") &&
      !text.startsWith("📣") &&
      !text.startsWith("🖼") &&
      !text.startsWith("📸") &&
      !text.startsWith("✅")
    ) {
      const parts = text.split(",").map((x) => x.trim());

      const order = {
        name: parts[0] || "",
        phone: parts[1] || "",
        city: parts[2] || "",
        branch: parts[3] || "",
        product: parts[4] || ""
      };

      // запис у таблицю
      await fetch(SHEET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(order)
      });

      await sendMessage(
        chatId,
        "✅ Замовлення прийнято! Менеджер перевірить заявку та зв'яжеться з вами."
      );

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
