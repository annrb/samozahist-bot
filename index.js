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
const pendingOrders = new Map();

const consultantCooldown = new Map();

const broadcastState = new Map();
const adminMenuUsers = new Set();

function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_ID);
}

function adminKeyboard() {
  return {
    keyboard: [
      [{ text: "📣 Розсилка" }],
      [{ text: "📊 Статистика" }],
      [{ text: "🏠 Назад" }]
    ],
    resize_keyboard: true
  };
}

function broadcastAudienceKeyboard() {
  return {
    keyboard: [
      [{ text: "👥 Всім" }],
      [{ text: "🛒 Покупцям" }],
      [{ text: "⭐ Повторним клієнтам" }],
      [{ text: "👀 Цікавились" }],
      [{ text: "❌ Скасувати" }]
    ],
    resize_keyboard: true
  };
}

function sourceFromText(text) {
  if (text && text.startsWith("/start ")) {
    const src = text.replace("/start ", "").trim().toLowerCase();
    if (["instagram", "tiktok", "site", "telegram"].includes(src)) return src;
  }
  return "telegram";
}

function updateCRM(data) {
  console.log("CRM DATA:", JSON.stringify(data));

  fetch(SHEET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  }).catch(console.error);
}

async function sendMessage(chatId, text, extra = {}) {
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...extra
    })
  });
}

async function forwardMessage(chatId, fromChatId, messageId) {
  return fetch(`${TELEGRAM_API}/forwardMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId
    })
  });
}

function getUserData(msg, source = "telegram") {
  const username = msg.from.username ? "@" + msg.from.username : "немає";
  const profile = msg.from.username ? `https://t.me/${msg.from.username}` : "";

  return {
    name: msg.from.first_name || "Без імені",
    username,
    telegramId: String(msg.from.id),
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
      [{ text: "🖼 Наші фото / відгуки" }],
      [{ text: "📸 Скинути фото-відгук" }],
      [{ text: "📢 Канал новин" }]
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
  res.sendStatus(200); // відповідаємо Telegram одразу

  const body = req.body;

// inline-кнопки
if (body.callback_query) {
  const data = body.callback_query.data;
  const adminChatId = body.callback_query.message.chat.id;

  const action = data.split("_")[0];
  const telegramId = data.split("_")[1];

  if (action === "paid") {
  updateCRM({
    telegramId,
    paymentStatus: "✅ Оплату підтверджено",
    comment: "Оплату підтверджено менеджером"
  });

  // повідомлення клієнту
  await sendMessage(
    telegramId,
    `✅ Оплату отримано

📦 Ваше замовлення підтверджено та передано на відправку.
Дякуємо за покупку ❤️`
  );

  // повідомлення менеджеру
  await sendMessage(adminChatId, "✅ Оплату підтверджено");

  return;
}

if (action === "problem") {
  updateCRM({
    telegramId,
    paymentStatus: "❌ Проблема з оплатою",
    comment: "Проблема з оплатою"
  });

  // повідомлення клієнту
  await sendMessage(
    telegramId,
    `❗ Ми не змогли підтвердити оплату

Будь ласка, перевірте:
• чи правильно вказана сума
• чи успішно пройшов платіж
• чи надісланий скріншот оплати

Якщо все вірно — надішліть скрін ще раз 📸`
  );

  // повідомлення менеджеру
  await sendMessage(adminChatId, "❌ Позначено проблему з оплатою");

  return;
}

  return;
}

// звичайні повідомлення
if (!body.message) return;

const msg = body.message;
const chatId = msg.chat.id;
const text = msg.text || "";
  const caption = msg.caption || "";
const source = sourceFromText(text);
const user = getUserData(msg, source);
    // адмін-панель
  if (text === "/admin" && isAdmin(chatId)) {
    await sendMessage(
      chatId,
      "⚙️ Адмін-панель",
      { reply_markup: adminKeyboard() }
    );
    return;
  }

  if (text === "🏠 Назад" && isAdmin(chatId)) {
    await sendMessage(
      chatId,
      "Головне меню 👇",
      { reply_markup: mainKeyboard() }
    );
    return;
  }

  if (text === "📣 Розсилка" && isAdmin(chatId)) {
    broadcastState.set(chatId, { step: "choose_audience" });

    await sendMessage(
      chatId,
      "👥 Обери аудиторію для розсилки:",
      { reply_markup: broadcastAudienceKeyboard() }
    );
    return;
  }

  if (
    ["👥 Всім", "🛒 Покупцям", "⭐ Повторним клієнтам", "👀 Цікавились"].includes(text) &&
    isAdmin(chatId)
  ) {
    const state = broadcastState.get(chatId);
    if (state && state.step === "choose_audience") {
      state.step = "wait_post";
      state.audience = text;
      broadcastState.set(chatId, state);

      await sendMessage(
        chatId,
        "📝 Надішліть пост для розсилки (текст / фото / відео)"
      );
      return;
    }
  }

  if (text === "❌ Скасувати" && isAdmin(chatId)) {
    broadcastState.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Дію скасовано",
      { reply_markup: adminKeyboard() }
    );
    return;
  }
    if (text === "📊 Статистика" && isAdmin(chatId)) {
  const response = await fetch(SHEET_URL);
  const rows = await response.json();

  const leads = rows.length;

  const orders = rows.filter(x => {
  const s = String(x.status || "");
  return s.includes("Замовлення") || s.includes("Повторний");
}).length;

  const repeat = rows.filter(x =>
    String(x.status || "").includes("Повторний")
  ).length;

  const paid = rows.filter(x =>
  String(x.paymentStatus || "").includes("Оплату підтверджено")
).length;

  const inTransit = rows.filter(x =>
    String(x.deliveryStatus || "").includes("Відправлено")
  ).length;

  const received = rows.filter(x =>
    String(x.deliveryStatus || "").includes("Отримано")
  ).length;

  const reviews = rows.filter(x =>
    String(x.status || "").includes("відгук")
  ).length;

  await sendMessage(
    chatId,
`📊 Статистика

👥 Лідів: ${leads}
🛒 Замовлень: ${orders}
⭐ Повторних: ${repeat}
💰 Оплачено: ${paid}
🚚 В дорозі: ${inTransit}
✅ Отримано: ${received}
📸 Відгуків: ${reviews}`
  );

  return;
}
    // прийом поста для розсилки
  const adminState = broadcastState.get(chatId);

  if (
    isAdmin(chatId) &&
    adminState &&
    adminState.step === "wait_post"
  ) {
    adminState.step = "confirm";
    adminState.post = {
      text: text || caption || "",
      photo: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
      video: msg.video ? msg.video.file_id : null
    };

    broadcastState.set(chatId, adminState);

    // прев’ю
    if (adminState.post.photo) {
      await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: adminState.post.photo,
          caption: adminState.post.text,
          reply_markup: {
            keyboard: [
              [{ text: "✅ Розіслати" }],
              [{ text: "❌ Скасувати" }]
            ],
            resize_keyboard: true
          }
        })
      });
    } else if (adminState.post.video) {
      await fetch(`${TELEGRAM_API}/sendVideo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          video: adminState.post.video,
          caption: adminState.post.text,
          reply_markup: {
            keyboard: [
              [{ text: "✅ Розіслати" }],
              [{ text: "❌ Скасувати" }]
            ],
            resize_keyboard: true
          }
        })
      });
    } else {
      await sendMessage(
        chatId,
        `📨 Прев’ю розсилки:

${adminState.post.text}`,
        {
          reply_markup: {
            keyboard: [
              [{ text: "✅ Розіслати" }],
              [{ text: "❌ Скасувати" }]
            ],
            resize_keyboard: true
          }
        }
      );
    }

    return;
  }
    if (text === "✅ Розіслати" && isAdmin(chatId)) {
    const state = broadcastState.get(chatId);

    if (!state || state.step !== "confirm") {
      await sendMessage(chatId, "❌ Немає підготовленої розсилки");
      return;
    }

    await sendMessage(chatId, "🚀 Починаю розсилку...");

    const sentKeyboard = {
      inline_keyboard: [
        [
          {
            text: "🛒 Оформити замовлення",
            url: "https://t.me/samozahist_sales_bot"
          }
        ],
        [
          {
            text: "📢 Наш канал",
            url: "https://t.me/balon_kastet"
          }
        ]
      ]
    };

    // тимчасово — тест на себе
    const response = await fetch(SHEET_URL);
const rows = await response.json();

let targets = [];

if (state.audience === "👥 Всім") {
  targets = rows
    .map(x => String(x.telegramId || ""))
    .filter(Boolean);
}

if (state.audience === "🛒 Покупцям") {
  targets = rows
    .filter(x => String(x.status || "").includes("Замовлення"))
    .map(x => String(x.telegramId || ""))
    .filter(Boolean);
}

if (state.audience === "⭐ Повторним клієнтам") {
  targets = rows
    .filter(x => String(x.status || "").includes("Повторний"))
    .map(x => String(x.telegramId || ""))
    .filter(Boolean);
}

if (state.audience === "👀 Цікавились") {
  targets = rows
    .filter(x => String(x.status || "").includes("Цікавився"))
    .map(x => String(x.telegramId || ""))
    .filter(Boolean);
}

// прибрати дублікати
targets = [...new Set(targets)];

    let sent = 0;
    let failed = 0;

    for (const target of targets) {
      try {
        if (state.post.photo) {
          await fetch(`${TELEGRAM_API}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: target,
              photo: state.post.photo,
              caption: state.post.text,
              reply_markup: sentKeyboard
            })
          });
        } else if (state.post.video) {
          await fetch(`${TELEGRAM_API}/sendVideo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: target,
              video: state.post.video,
              caption: state.post.text,
              reply_markup: sentKeyboard
            })
          });
        } else {
          await sendMessage(
            target,
            state.post.text,
            { reply_markup: sentKeyboard }
          );
        }

        sent++;
      } catch (e) {
        failed++;
      }
    }

    broadcastState.delete(chatId);

    await sendMessage(
      chatId,
      `✅ Розсилка завершена

Надіслано: ${sent}
Помилки: ${failed}`,
      { reply_markup: adminKeyboard() }
    );

    return;
  }

  // створення / оновлення ліда у фоні
  if (
  text.startsWith("/start") ||
  ["привіт", "добрий день", "доброго дня", "вітаю", "hello", "hi"]
    .includes(text.toLowerCase().trim())
) {
  await sendMessage(
    chatId,
    `👋 Вітаємо в САМОЗАХИСТ UA

🛡 Допоможемо обрати засіб самозахисту.

Напишіть "+" для консультації або оберіть кнопку 👇`,
    { reply_markup: mainKeyboard() }
  );

  updateCRM({
    ...user,
    status: "🔴 Новий лід",
    comment: "Зайшов у бот"
  });

  return;
}

  // +
  if (text === "+") {
    const lastRequest = consultantCooldown.get(chatId);
const now = Date.now();

if (lastRequest && now - lastRequest < 300000) {
  await sendMessage(
    chatId,
    "⏳ Запит уже відправлено менеджеру. Будь ласка, зачекайте 5 хвилин 👌"
  );
  return;
}

consultantCooldown.set(chatId, now);
    await sendMessage(
      chatId,
      "💬 Напишіть коротко, для чого потрібен засіб самозахисту, і менеджер підкаже найкращий варіант."
    );

    await Promise.all([
      sendMessage(
        ADMIN_ID,
        `🔥 Новий теплий лід

👤 ${user.name}
🔗 ${user.username}
🆔 ${chatId}`
      ),
      forwardMessage(ADMIN_ID, chatId, msg.message_id)
    ]);

    updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Потрібна консультація"
    });
    return;
  }

  // Фото-відгук
  if (waitingReview.has(chatId) && (msg.photo || msg.video)) {
    waitingReview.delete(chatId);

    await sendMessage(chatId, "❤️ Дякуємо за відгук!", {
      reply_markup: mainKeyboard()
    });

    await Promise.all([
      sendMessage(ADMIN_ID, `📸 Новий фото-відгук від ${user.name}`),
      forwardMessage(ADMIN_ID, chatId, msg.message_id)
    ]);

    updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Надіслав фото-відгук"
    });
    return;
  }

  // Скрін оплати
  if (waitingPaymentProof.has(chatId) && (msg.photo || msg.document)) {
    waitingPaymentProof.delete(chatId);

    await sendMessage(
      chatId,
      "✅ Скрін отримано. Менеджер перевірить оплату.",
      { reply_markup: mainKeyboard() }
    );

    await forwardMessage(ADMIN_ID, chatId, msg.message_id);

await sendMessage(
  ADMIN_ID,
  `💳 Новий скрін оплати від ${user.name}`,
  {
    reply_markup: {
  inline_keyboard: [
  [
    {
      text: "✅ Підтвердити оплату",
      callback_data: `paid_${user.telegramId}`
    }
  ],
  [
    {
      text: "❌ Проблема",
      callback_data: `problem_${user.telegramId}`
    }
  ]
]
    }
  }
);

   updateCRM({
  ...user,
  payment: selectedPayment.get(chatId) || "",
  paymentStatus: "📸 Надіслав скрін",
  status: "🔵 Очікує перевірки оплати",
  comment: "Надіслав скрін оплати"
});
    
    return;
  }
  if (text === "💬 Консультант") {
  const lastRequest = consultantCooldown.get(chatId);
  const now = Date.now();

  if (lastRequest && now - lastRequest < 300000) {
    await sendMessage(
      chatId,
      "⏳ Ви вже звернулись до консультанта. Будь ласка, зачекайте 5 хвилин 👌"
    );
    return;
  }

  consultantCooldown.set(chatId, now);

  await Promise.all([
    sendMessage(
      chatId,
      "✅ Менеджер отримав ваше повідомлення і скоро відповість 👍"
    ),
    sendMessage(
      ADMIN_ID,
      `🔥 Запит на консультацію

👤 ${user.name}
🔗 ${user.username}
🆔 ${chatId}`
    )
  ]);

  updateCRM({
    ...user,
    status: "🟡 Цікавився",
    comment: "Натиснув консультант"
  });

  return;
}

  const isOrderMessage =
    text.includes(",") &&
    text.split(",").length >= 5;

  const isMenuButton = [
    "🛒 Асортимент",
    "📝 Оформити замовлення",
    "💳 Оплата / доставка",
    "💬 Консультант",
    "📣 Акції / новинки",
    "🖼 Наші фото / відгуки",
    "📸 Скинути фото-відгук",
    "✅ Підписатися на новини",
    "1️⃣ Повна оплата",
    "2️⃣ Накладний платіж (передоплата 100 грн)",
    "📋 Скопіювати реквізити",
    "📸 Надіслати скрін оплати",
    "⬅️ Назад",
    "+"
  ].includes(text);

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

    updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Дивився асортимент"
    });
    return;
  }

  if (text === "📝 Оформити замовлення") {
    await sendMessage(
      chatId,
      `📝 Надішліть ОДНИМ повідомленням:

ПІБ, телефон, місто, пункт доставки, товар

Приклад:
Іван Петренко, 0971234567, Львів, Поштомат 12, Кобра МВС x2 + Терен-4 x1`
    );
    return;
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

Якщо вже здійснили оплату — надішліть скріншот 📸`,
      { reply_markup: paymentKeyboard() }
    );

    updateCRM({
      ...user,
      status: "🟠 Готується до замовлення",
      comment: "Дивився оплату / доставку"
    });
    return;
  }

  
if (
  text === "1️⃣ Повна оплата" ||
  text === "2️⃣ Накладний платіж (передоплата 100 грн)"
) {
  const order = pendingOrders.get(chatId);

  // якщо це просто перегляд оплати / доставки
  if (!order) {
    if (text === "1️⃣ Повна оплата") {
      await sendMessage(
        chatId,
        `💳 Реквізити для оплати:

Номер карти: 4441 1144 4890 6972
Отримувач: Ковальчук О.

Після оплати натисніть:
📸 Надіслати скрін оплати`
      );
    } else {
      await sendMessage(
        chatId,
        `📦 Умови накладного платежу:

✅ Передоплата 100 грн
📦 Решта — на пошті при отриманні`
      );
    }

    return;
  }

  // якщо це оформлення замовлення
  const payment =
    text === "1️⃣ Повна оплата"
      ? "Повна оплата"
      : "Передоплата 100 грн / решта на пошті";

  selectedPayment.set(chatId, payment);

  await sendMessage(
  ADMIN_ID,
  `🆕 НОВЕ ЗАМОВЛЕННЯ

👤 ${order.name}
📞 ${order.phone}
🏙 ${order.city}
📦 ${order.delivery}
🛡 ${order.product}
💰 ${payment}`
);

// якщо повна оплата
if (text === "1️⃣ Повна оплата") {
  selectedPayment.set(chatId, payment);
  waitingPaymentProof.add(chatId);

  await sendMessage(
    chatId,
    "✅ Замовлення прийнято!\n\n💳 Оплатіть повну суму за реквізитами нижче 👇"
  );

  await sendMessage(chatId, "4441 1144 4890 6972");
  await sendMessage(chatId, "Ковальчук О.");

  await sendMessage(
    chatId,
    "📸 Після оплати надішліть скріншот платежу",
    { reply_markup: mainKeyboard() }
  );
}

// якщо накладний
if (text === "2️⃣ Накладний платіж (передоплата 100 грн)") {
  selectedPayment.set(chatId, payment);
  waitingPaymentProof.add(chatId);

  await sendMessage(
    chatId,
    "✅ Замовлення прийнято!\n\n💳 Для підтвердження замовлення внесіть передоплату 100 грн 👇"
  );

  await sendMessage(chatId, "4441 1144 4890 6972");
  await sendMessage(chatId, "Отримувач: Ковальчук О.");

  await sendMessage(
    chatId,
    "📸 Після оплати надішліть скріншот платежу",
    { reply_markup: mainKeyboard() }
  );
}

updateCRM({
  ...user,
  ...order,
  payment,
  status: "🟢 Замовлення",
  comment: "Оформив замовлення"
});
  pendingOrders.delete(chatId);
  return;
}
  if (text === "🖼 Наші фото / відгуки") {
    await sendMessage(chatId, "https://t.me/vidgyku_balonkastet");

    updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Дивився відгуки"
    });
    return;
  }

  if (text === "📸 Скинути фото-відгук") {
    waitingReview.add(chatId);
    await sendMessage(chatId, "Надішліть фото або відео ❤️");
    return;
  }

  if (text === "📢 Канал новин") {
  await sendMessage(
    chatId,
    `📢 Наш офіційний канал новин:

https://t.me/balon_kastet

Підписуйтесь, щоб не пропустити новинки, акції та корисну інформацію 🔥`
  );

  updateCRM({
    ...user,
    status: "🟡 Цікавився",
    comment: "Перейшов у канал новин"
  });

  return;
}

  if (text === "📋 Скопіювати реквізити") {
  await sendMessage(chatId, "💳 Реквізити для оплати:");

  await sendMessage(chatId, "4441 1144 4890 6972");

  await sendMessage(chatId, "Отримувач: Ковальчук О.");

  return;
}

if (text === "📸 Надіслати скрін оплати") {
  waitingPaymentProof.add(chatId);

  await sendMessage(
    chatId,
    "📸 Надішліть скріншот оплати одним повідомленням"
  );
  return;
}

if (text === "⬅️ Назад") {
  await sendMessage(chatId, "Головне меню 👇", {
    reply_markup: mainKeyboard()
  });
  return;
}

// Замовлення / вільне повідомлення
    // Замовлення / вільне повідомлення
  if (isOrderMessage && !msg.photo && !msg.video && !msg.document) {
  const parts = text.split(",").map(x => x.trim());

  if (parts.length >= 5) {
    const order = {
      name: parts[0],
      phone: parts[1],
      city: parts[2],
      delivery: parts[3],
      product: parts.slice(4).join(", ")
    };

    const cleanPhone = order.phone.replace(/\D/g, "");
    const validPhone =
      /^0\d{9}$/.test(cleanPhone) ||
      /^380\d{9}$/.test(cleanPhone);
    

    if (!validPhone) {
      await sendMessage(
        chatId,
        "❌ Невірний номер телефону.\n\nПриклад: 0971234567 або +380971234567"
      );
      return;
    }

    pendingOrders.set(chatId, {
      ...order,
      phone: cleanPhone
    });

    await sendMessage(chatId, "💳 Оберіть спосіб оплати:", {
      reply_markup: {
        keyboard: [
          [{ text: "1️⃣ Повна оплата" }],
          [{ text: "2️⃣ Накладний платіж (передоплата 100 грн)" }]
        ],
        resize_keyboard: true
      }
    });

    return;
  }
}
// вільне повідомлення
await Promise.all([
  sendMessage(
    chatId,
    "✅ Менеджер отримав ваше повідомлення і скоро відповість 👍"
  ),
  forwardMessage(ADMIN_ID, chatId, msg.message_id)
]);

updateCRM({
  ...user,
  status: "🟡 Цікавився",
  comment: "Потрібна консультація"
});

return;
});  

app.get("/", (req, res) => {
  res.send("BOT WORKING");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started"));
