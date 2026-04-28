const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = 455696990;

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbxbt-IkoBVsG1nsspQmkGQ49qhmpSB_vw6llTzJXwRIrVHVtT0QaegT6pob07zfWYNh/exec";

const waitingReview = new Set();
const waitingPaymentProof = new Set();
const selectedPayment = new Map();

function sourceFromText(text) {
  if (text && text.startsWith("/start ")) {
    const src = text.replace("/start ", "").trim().toLowerCase();
    if (["instagram", "tiktok", "site", "telegram"].includes(src)) return src;
  }
  return "telegram";
}

async function updateCRM(data) {
  await fetch(SHEET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
}

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

async function forwardMessage(chatId, fromChatId, messageId) {
  await fetch(`${TELEGRAM_API}/forwardMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId
    })
  });
}

function getUserData(msg, source = "telegram") {
  const username = msg.from.username ? "@" + msg.from.username : "немає";
  const profile = msg.from.username
    ? `https://t.me/${msg.from.username}`
    : "";

  return {
    name: msg.from.first_name || "Без імені",
    username,
    telegramId: msg.chat.id,
    profile,
    source
  };
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "🛒 Асортимент" }],
      [{ text: "📝 Оформити замовлення" }],
      [{ text: "💳 Оплата / доставка" }],
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
      [{ text: "1️⃣ Повна оплата" }],
      [{ text: "2️⃣ Накладний платіж (передоплата 100 грн)" }],
      [{ text: "📋 Скопіювати реквізити" }],
      [{ text: "📸 Надіслати скрін оплати" }],
      [{ text: "⬅️ Назад" }]
    ],
    resize_keyboard: true
  };
}

app.post("/", async (req, res) => {
  const body = req.body;
  if (!body.message) return res.sendStatus(200);

  const msg = body.message;
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const source = sourceFromText(text);
  const user = getUserData(msg, source);

  // будь-яка дія = оновлення/створення ліда
  await updateCRM({
    ...user,
    status: "🔴 Новий лід",
    comment: "Зайшов у бот"
  });

  // +
  if (text === "+") {
    await sendMessage(
      chatId,
      "💬 Напишіть коротко, для чого потрібен засіб самозахисту, і менеджер підкаже найкращий варіант."
    );

    await sendMessage(
      ADMIN_ID,
      `🔥 Новий теплий лід

👤 ${user.name}
🔗 ${user.username}
🆔 ${chatId}`
    );

    await forwardMessage(ADMIN_ID, chatId, msg.message_id);

    await updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Потрібна консультація"
    });
  }

  // Фото-відгук
  if (waitingReview.has(chatId) && (msg.photo || msg.video)) {
    waitingReview.delete(chatId);

    await sendMessage(chatId, "❤️ Дякуємо за відгук!", {
      reply_markup: mainKeyboard()
    });

    await sendMessage(ADMIN_ID, `📸 Новий фото-відгук від ${user.name}`);
    await forwardMessage(ADMIN_ID, chatId, msg.message_id);

    await updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Надіслав фото-відгук"
    });
  }

  // Скрін оплати
  if (waitingPaymentProof.has(chatId) && (msg.photo || msg.document)) {
    waitingPaymentProof.delete(chatId);

    await sendMessage(
      chatId,
      "✅ Скрін отримано. Менеджер перевірить оплату.",
      { reply_markup: mainKeyboard() }
    );

    await sendMessage(ADMIN_ID, `💳 Новий скрін оплати від ${user.name}`);
    await forwardMessage(ADMIN_ID, chatId, msg.message_id);

    await updateCRM({
      ...user,
      payment: selectedPayment.get(chatId) || "",
      status: "🔵 Очікує перевірки оплати",
      comment: "Надіслав скрін оплати"
    });
  }

  // start
  if (text.startsWith("/start")) {
    await sendMessage(
      chatId,
      `👋 Вітаємо в САМОЗАХИСТ UA

🛡 Допоможемо обрати засіб самозахисту.

Напишіть "+" для консультації або оберіть кнопку 👇`,
      { reply_markup: mainKeyboard() }
    );
  }

  if (text === "🛒 Асортимент") {
    await sendMessage(
      chatId,
      `🔥 Наш асортимент:

1) КОБРА-1 МВС — 300 грн
2) КОБРА-1Н 100 мл — 250 грн
3) ТЕРЕН-4 — 250 грн
4) ТРИЗУБ-4 — 250 грн
5) КОБРА-1Н 50 мл — 200 грн`
    );

    await updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Дивився асортимент"
    });
  }

  if (text === "📝 Оформити замовлення") {
    await sendMessage(
      chatId,
      `📝 Надішліть ОДНИМ повідомленням:

ПІБ, телефон, місто, пункт доставки, товар

Приклад:
Іван Петренко, 0971234567, Львів, Поштомат 12, КОБРА-1 МВС`
    );
  }

  if (text === "💳 Оплата / доставка") {
    await sendMessage(
      chatId,
      `💳 Варіанти оплати та доставки

1️⃣ Повна оплата на карту без переплати на пошті
🤝 Нам довіряють 1400+ клієнтів
🖼 Відгуки: @vidgyku_balonkastet

2️⃣ Накладний платіж
✅ Передоплата 100 грн
📦 Решта — на пошті при отриманні

Оберіть зручний варіант 👇`,
      { reply_markup: paymentKeyboard() }
    );

    await updateCRM({
      ...user,
      status: "🟠 Готується до замовлення",
      comment: "Дивився оплату / доставку"
    });
  }

  if (text === "1️⃣ Повна оплата") {
    selectedPayment.set(chatId, "Повна оплата");
    await sendMessage(chatId, "✅ Ви обрали повну оплату");
  }

  if (text === "2️⃣ Накладний платіж (передоплата 100 грн)") {
    selectedPayment.set(chatId, "Накладний платіж / передоплата 100 грн");
    await sendMessage(chatId, "✅ Ви обрали накладний платіж");
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
    await sendMessage(
      chatId,
      `🔥 АКЦІЇ / НОВИНКИ

🆕 Свіжа поставка КОБРА-1 МВС — в наявності!
💰 Ціна: 300 грн

✅ КОБРА-1Н 50 мл — 200 грн`
    );

    await updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Цікавився акціями"
    });
  }

  if (text === "🖼 Наші фото / відгуки") {
    await sendMessage(chatId, "https://t.me/vidgyku_balonkastet");

    await updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Дивився відгуки"
    });
  }

  if (text === "📸 Скинути фото-відгук") {
    waitingReview.add(chatId);
    await sendMessage(chatId, "Надішліть фото або відео ❤️");
  }

  if (text === "✅ Підписатися на новини") {
    await sendMessage(chatId, "✅ Ви підписались на новини");

    await updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Підписався на новини"
    });
  }

  // Замовлення
  if (text.includes(",") && !text.startsWith("/")) {
    const parts = text.split(",").map(x => x.trim());

    if (parts.length >= 5) {
      const order = {
        name: parts[0],
        phone: parts[1],
        city: parts[2],
        delivery: parts[3],
        product: parts[4]
      };

      await sendMessage(
        chatId,
        "✅ Замовлення прийнято! Менеджер зв'яжеться з вами."
      );

      await sendMessage(
        ADMIN_ID,
        `🆕 НОВЕ ЗАМОВЛЕННЯ

👤 ${order.name}
📞 ${order.phone}
🏙 ${order.city}
📦 ${order.delivery}
🛡 ${order.product}`
      );

      await updateCRM({
        ...user,
        phone: order.phone,
        city: order.city,
        delivery: order.delivery,
        product: order.product,
        payment: selectedPayment.get(chatId) || "",
        status: "🟢 Замовлення",
        comment: "Оформив замовлення"
      });
    }
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("BOT WORKING");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started"));
