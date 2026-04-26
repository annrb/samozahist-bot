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
Передоплата: 100 грн або повна оплата

Оберіть дію нижче 👇`;

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
const waitingPaymentProof = new Set();

function mainKeyboard() {
  return {
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
  };
}

function paymentKeyboard() {
  return {
    keyboard: [
      [{ text: "📋 Скопіювати реквізити" }],
      [{ text: "📸 Надіслати скрін оплати" }],
      [{ text: "⬅️ Назад" }]
    ],
    resize_keyboard: true
  };
}

app.post("/", async (req, res) => {
  const body = req.body;

  if (body.message) {
    const msg = body.message;
    const chatId = msg.chat.id;
    const text = msg.text || "";

    // теплий лід
    if (text === "+") {
      await sendMessage(
        chatId,
        "💬 Напишіть коротко, для чого потрібен засіб самозахисту (місто / авто / для дівчини / інше), і менеджер підкаже найкращий варіант."
      );

      await sendMessage(
        ADMIN_ID,
        `🔥 Новий теплий лід\nКлієнт написав "+" (ID: ${chatId})`
      );
    }

    // Фото/відео відгук
    if (waitingReview.has(chatId) && (msg.photo || msg.video)) {
      waitingReview.delete(chatId);

      await sendMessage(chatId, "❤️ Дякуємо за ваш відгук!", {
        reply_markup: mainKeyboard()
      });

      await sendMessage(
        ADMIN_ID,
        `📸 Новий фото-відгук від клієнта (ID: ${chatId})`
      );
    }

    // Скрін оплати
    if (waitingPaymentProof.has(chatId) && (msg.photo || msg.document)) {
      waitingPaymentProof.delete(chatId);

      await sendMessage(
        chatId,
        "✅ Скрін оплати отримано. Менеджер перевірить оплату.",
        { reply_markup: mainKeyboard() }
      );

      await sendMessage(
        ADMIN_ID,
        `💳 Клієнт (ID: ${chatId}) надіслав скрін оплати`
      );
    }

    if (text === "/start") {
      await sendMessage(
        chatId,
        `👋 Вітаємо в САМОЗАХИСТ UA

🛡 Допоможемо підібрати ідеальний засіб самозахисту саме для вас.

Напишіть "+" у чат, якщо потрібна консультація, або оберіть кнопку нижче 👇`,
        { reply_markup: mainKeyboard() }
      );
    }

    if (text === "🛒 Асортимент") {
      await sendMessage(chatId, PRODUCTS);
    }

    if (text === "📝 Оформити замовлення") {
      await sendMessage(chatId, ORDER_TEXT);
    }

    if (text === "💳 Оплата") {
      await sendMessage(chatId, PAYMENT_TEXT, {
        reply_markup: paymentKeyboard()
      });
    }

    if (text === "📋 Скопіювати реквізити") {
      await sendMessage(chatId, "4441 **** **** 6972");
    }

    if (text === "📸 Надіслати скрін оплати") {
      waitingPaymentProof.add(chatId);
      await sendMessage(chatId, "Надішліть скрін оплати 📸");
    }

    if (text === "⬅️ Назад") {
      await sendMessage(chatId, "Головне меню 👇", {
        reply_markup: mainKeyboard()
      });
    }

    if (text === "💬 Консультант") {
      await sendMessage(chatId, "Напишіть менеджеру: @annrb");
    }

    if (text === "📣 Акції / новинки") {
      await sendMessage(chatId, PROMO_TEXT);
    }

    if (text === "🖼 Наші фото / відгуки") {
      await sendMessage(
        chatId,
        "Наш канал з фото та відгуками:\nhttps://t.me/vidgyku_balonkastet"
      );
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
      !text.startsWith("✅") &&
      !text.startsWith("📋") &&
      !text.startsWith("⬅️")
    ) {
      const parts = text.split(",").map((x) => x.trim());

      const order = {
        name: parts[0] || "",
        phone: parts[1] || "",
        city: parts[2] || "",
        branch: parts[3] || "",
        product: parts[4] || ""
      };

      await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
