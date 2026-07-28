const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const ADMIN_ID = 455696990;

const SHEET_URL =
"https://script.google.com/macros/s/AKfycbwMGSDjh3KL8L_OY9m4KAFkCAqgaRI87jyHIRXxo9WYw77etUZSDUSf-tipuFk9_CQg/exec";

const waitingReview = new Set();
const waitingPaymentProof = new Set();
const selectedPayment = new Map();
const pendingOrders = new Map();

const cart = new Map();
const selectedProduct = new Map();
const selectedQuantity = new Map();
const waitingCustomerData = new Set();

const orderStep = new Map();
const orderDraft = new Map();

const consultantCooldown = new Map();
const waitingConsultant = new Set();

const broadcastState = new Map();
const adminMenuUsers = new Set();
const replyState = new Map();

const ttnState = new Map();

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

  const controller = new AbortController();

  setTimeout(() => controller.abort(), 10000);

  fetch(SHEET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data),
    signal: controller.signal
  }).catch(console.error);
}

const REQUEST_TIMEOUT = 10000;

async function telegramRequest(method, payload) {
  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT);

    const response = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`${method} ERROR:`, await response.text());
      return null;
    }

    return await response.json();

  } catch (err) {
    console.error(`${method} ERROR:`, err.message);
    return null;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function forwardMessage(chatId, fromChatId, messageId) {
  return telegramRequest("forwardMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId
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

const products = {
  cobra_mvs: {
    name: "КОБРА-1 МВС",
    price: 300
  },
  cobra100: {
    name: "КОБРА-1Н 100 мл",
    price: 250
  },
  teren4: {
    name: "ТЕРЕН-4",
    price: 250
  },
  teren4m: {
    name: "ТЕРЕН-4М",
    price: 290
  },
  trizub4: {
    name: "ТРИЗУБ-4",
    price: 250
  },
  cobra50: {
    name: "КОБРА-1Н 50 мл",
    price: 200
  },
	teren1b: {
  name: "ТЕРЕН-1Б 50 мл",
  price: 220
},
};

app.post("/", async (req, res) => {
  res.sendStatus(200); // відповідаємо Telegram одразу

  const body = req.body;

// inline-кнопки
if (body.callback_query) {
	const callbackId = body.callback_query.id;
await telegramRequest("answerCallbackQuery", {
  callback_query_id: callbackId
});
  const data = body.callback_query.data;
  const adminChatId = body.callback_query.message.chat.id;

  const action = data.split("_")[0];
  const telegramId = data.split("_")[1];
	console.log("CALLBACK =", data);
  
  if (action === "product") {

  const productKey = data.replace("product_", "");
  const product = products[productKey];

  selectedProduct.set(adminChatId, productKey);
  selectedQuantity.set(adminChatId, 1);

  await sendMessage(
    adminChatId,
    `🛒 ${product.name}

💰 Ціна: ${product.price} грн
📦 Кількість: 1`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "➖", callback_data: "minus" },
            { text: "1", callback_data: "count" },
            { text: "➕", callback_data: "plus" }
          ],
          [
            {
              text: "🛒 Додати в кошик",
              callback_data: "addcart"
            }
          ]
        ]
      }
    }
  );

  return;
}

	if (data === "count") {
  return;
}
	
if (data === "plus" || data === "minus") {

  let qty = selectedQuantity.get(adminChatId) || 1;

  if (data === "plus") {
    qty++;
  }

  if (data === "minus" && qty > 1) {
    qty--;
  }

  selectedQuantity.set(adminChatId, qty);

  const productKey =
    selectedProduct.get(adminChatId);

  const product =
    products[productKey];

  await sendMessage(
    adminChatId,
    `🛒 ${product.name}

💰 Ціна: ${product.price} грн
📦 Кількість: ${qty}

💵 Разом: ${qty * product.price} грн`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➖",
              callback_data: "minus"
            },
            {
              text: String(qty),
              callback_data: "count"
            },
            {
              text: "➕",
              callback_data: "plus"
            }
          ],
          [
            {
              text: "🛒 Додати в кошик",
              callback_data: "addcart"
            }
          ]
        ]
      }
    }
  );

  return;
}

if (data === "addcart") {

  const productKey =
    selectedProduct.get(adminChatId);

  const qty =
    selectedQuantity.get(adminChatId) || 1;

  const product =
    products[productKey];

  let userCart =
    cart.get(adminChatId) || [];

  userCart.push({
    product: product.name,
    qty: qty,
    price: product.price
  });

  cart.set(adminChatId, userCart);

  let total = 0;

  let textCart =
    "🛒 Ваш кошик:\n\n";

  userCart.forEach(item => {

    total +=
      item.qty * item.price;

    textCart +=
`${item.product}
x${item.qty}
= ${item.qty * item.price} грн

`;
  });

  textCart +=
`💵 Разом: ${total} грн`;

  await sendMessage(
    adminChatId,
    textCart,
    {
      reply_markup: {
  inline_keyboard: [
    [
      {
        text:"➕ Додати ще",
        callback_data:"more"
      }
    ],
    [
      {
        text:"✏️ Видалити останній",
        callback_data:"removeitem"
      }
    ],
    [
      {
        text:"🗑 Очистити кошик",
        callback_data:"clearcart"
      }
    ],
    [
      {
        text:"✅ Оформити",
        callback_data:"checkout"
      }
    ]
  ]
}
    }
  );

  return;
}

if (data === "more") {
	

  selectedQuantity.set(adminChatId, 1);

  await sendMessage(
    adminChatId,
    "🛒 Оберіть ще товар:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "КОБРА-1 МВС — 300", callback_data: "product_cobra_mvs" }],
          [{ text: "КОБРА-1Н 100 мл — 250", callback_data: "product_cobra100" }],
          [{ text: "ТЕРЕН-4 — 250", callback_data: "product_teren4" }],
          [{ text: "ТЕРЕН-4М — 290", callback_data: "product_teren4m" }],
          [{ text: "ТРИЗУБ-4 — 250", callback_data: "product_trizub4" }],
          [{ text: "КОБРА-1Н 50 мл — 200", callback_data: "product_cobra50" }]
		  [{ text: "ТЕРЕН-1Б 50 мл — 220", callback_data: "product_teren1b" }],
        ]
      }
    }
  );

  return;
}

if (data === "removeitem") {

  let userCart =
    cart.get(adminChatId) || [];

  if (!userCart.length) {
    await sendMessage(
      adminChatId,
      "❌ Кошик порожній"
    );
    return;
  }

  userCart.pop();

  if (!userCart.length) {

    cart.delete(adminChatId);

    await sendMessage(
      adminChatId,
      "🗑 Кошик порожній"
    );

    return;
  }

  cart.set(adminChatId, userCart);

  let total = 0;

  let textCart =
    "🛒 Ваш кошик:\\n\\n";

  userCart.forEach(item => {

    total +=
      item.qty * item.price;

    textCart +=
`${item.product}
x${item.qty}
= ${item.qty * item.price} грн

`;
  });

  textCart +=
`💵 Разом: ${total} грн`;

  await sendMessage(
    adminChatId,
    textCart,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:"➕ Додати ще",
              callback_data:"more"
            }
          ],
          [
            {
              text:"✏️ Видалити останній",
              callback_data:"removeitem"
            }
          ],
          [
            {
              text:"🗑 Очистити кошик",
              callback_data:"clearcart"
            }
          ],
          [
            {
              text:"✅ Оформити",
              callback_data:"checkout"
            }
          ]
        ]
      }
    }
  );

  return;
}

if (data === "clearcart") {

  cart.delete(adminChatId);

  await sendMessage(
    adminChatId,
    "🗑 Кошик очищено.\n\n🛒 Оберіть товар:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "КОБРА-1 МВС — 300", callback_data: "product_cobra_mvs" }],
          [{ text: "КОБРА-1Н 100 мл — 250", callback_data: "product_cobra100" }],
          [{ text: "ТЕРЕН-4 — 250", callback_data: "product_teren4" }],
          [{ text: "ТЕРЕН-4М — 290", callback_data: "product_teren4m" }],
          [{ text: "ТРИЗУБ-4 — 250", callback_data: "product_trizub4" }],
          [{ text: "КОБРА-1Н 50 мл — 200", callback_data: "product_cobra50" }]
		  [{ text: "ТЕРЕН-1Б 50 мл — 220", callback_data: "product_teren1b" }],
        ]
      }
    }
  );

  return;
}

if (data === "checkout") {

  if (!cart.get(adminChatId)?.length) {
    await sendMessage(
      adminChatId,
      "❌ Кошик порожній"
    );
    return;
  }

  orderStep.set(adminChatId, "firstName");
  orderDraft.set(adminChatId, {});

  await sendMessage(
  adminChatId,
  "👤 Введіть ваше ім'я:",
  {
    reply_markup: {
      keyboard: [
        [{ text: "❌ Скасувати" }]
      ],
      resize_keyboard: true
    }
  }
);
  return;
}

if (action === "ttn") {

  const crm = await fetch(
    `${SHEET_URL}?telegramId=${telegramId}`
  );

  const order = await crm.json();

console.log("ORDER =", order);
console.log("PHONE =", order.phone, typeof order.phone);
console.log("RAW =", JSON.stringify(order));

  if (!order.success) {
    await sendMessage(adminChatId, "❌ Замовлення не знайдено");
    return;
  }

  // Повна оплата → одразу створюємо ТТН
  if (order.payment !== "Накладний платіж") {

    const params = new URLSearchParams({
      createTTN: "1",
      row: order.row,
      name: order.name,
      phone: order.rawPhone || order.phone,
      city: order.city,
      delivery: order.delivery,
      payment: order.payment,
      amount: 0
    });

    const response = await fetch(`${SHEET_URL}?${params}`);
    const result = await response.json();

    if (result.success) {

      await sendMessage(
        adminChatId,
        `✅ ТТН створено\n\n📦 ${result.ttn}`
      );

    } else {

      await sendMessage(
        adminChatId,
        `❌ ${result.error}`
      );

    }

    return;
  }

  // Накладний платіж → просимо суму
  ttnState.set(String(adminChatId), {
    customerId: telegramId
  });

  await sendMessage(
    adminChatId,
    "💰 Введіть суму накладного платежу:"
  );

  return;
}
if (action === "blacklist") {

  const crm = await fetch(
    `${SHEET_URL}?telegramId=${telegramId}`
  );

  const customer = await crm.json();

  if (!customer.success) {
    await sendMessage(adminChatId, "❌ Клієнта не знайдено");
    return;
  }

  const params = new URLSearchParams({
    blacklist: "1",
    telegramId: telegramId,
    name: customer.name,
    phone: customer.phone,
    reason: "Заблоковано адміністратором"
  });

  const response = await fetch(
    `${SHEET_URL}?${params.toString()}`
  );

  const result = await response.json();

  if (result.success) {
    await sendMessage(
      adminChatId,
      "✅ Клієнта додано до BLACKLIST"
    );
  } else {
    await sendMessage(
      adminChatId,
      "❌ Не вдалося додати клієнта"
    );
  }

  return;
}
  if (action === "reply") {
  replyState.set(adminChatId, telegramId);

  await sendMessage(
    adminChatId,
    `✍️ Напишіть повідомлення для клієнта (${telegramId})`
  );

  return;
}

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

	  selectedPayment.delete(String(telegramId));
waitingPaymentProof.delete(String(telegramId));

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
	const check = await fetch(
  `${SHEET_URL}?checkBlacklist=1&telegramId=${chatId}`
);

const blacklist = await check.json();

if (blacklist.blocked) {
  await sendMessage(
    chatId,
    "⛔ Ваш акаунт заблоковано.\n\nЯкщо ви вважаєте, що це помилка, зверніться до адміністратора."
  );
  return;
}
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
	if (isAdmin(chatId) && ttnState.has(String(chatId))) {

  const amount = text.replace(/\D/g, "");

  if (!amount) {
    await sendMessage(
      chatId,
      "❌ Введіть тільки суму цифрами"
    );
    return;
  }

  const data = ttnState.get(String(chatId));
console.log("TTN DATA =", data);
console.log("AMOUNT =", amount);

await sendMessage(
  chatId,
  "⏳ Створюю ТТН..."
);

console.log(
  `${SHEET_URL}?createTTN=1&telegramId=${data.customerId}&amount=${amount}`
);

const crm = await fetch(
  `${SHEET_URL}?telegramId=${data.customerId}`
);

const order = await crm.json();

console.log("ORDER =", JSON.stringify(order));

if (!order.success) {
  throw new Error("Замовлення не знайдено");
}

const params = new URLSearchParams({
  createTTN: "1",
  row: order.row,
  name: order.name,
  phone: order.rawPhone || order.phone,
  city: order.city,
  delivery: order.delivery,
  payment: order.payment || "Передплата",
  amount: amount
});

const response = await fetch(
  `${SHEET_URL}?${params.toString()}`
);

const result = await response.json();
console.log("RESULT =", JSON.stringify(result));

if (result.success) {

  await sendMessage(
    chatId,
    `✅ ТТН створено

📦 Номер:
${result.ttn}`
  );

} else {

  await sendMessage(
    chatId,
    `❌ Помилка створення ТТН

${result.error || ""}`
  );
}

ttnState.delete(String(chatId));

return;
}
	
  if (isAdmin(chatId) && replyState.has(chatId)) {
  const clientId = replyState.get(chatId);

  await sendMessage(
    clientId,
    `💬 Повідомлення від менеджера:

${text}`
  );

  await sendMessage(chatId, "✅ Повідомлення відправлено");
  replyState.delete(chatId);
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
	  waitingConsultant.add(chatId);
	  
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
if (
  waitingPaymentProof.has(chatId) &&
  (msg.photo || msg.document)
) {
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
🆔 ${chatId}`,
  {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✍️ Відповісти",
            callback_data: `reply_${chatId}`
          }
        ]
      ]
    }
  }
)
  ]);

  updateCRM({
    ...user,
    status: "🟡 Цікавився",
    comment: "Натиснув консультант"
  });

  return;
}


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
    "2️⃣ Накладний платіж (оплата при отриманні)",
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
4) ТЕРЕН-4М — 290 грн
5) ТРИЗУБ-4 — 250 грн
6) КОБРА-1Н 50 мл — 200 грн
7) ТЕРЕН-1Б 50 мл — 220 грн`
);

    updateCRM({
      ...user,
      status: "🟡 Цікавився",
      comment: "Дивився асортимент"
    });
    return;
  }

  if (text === "📝 Оформити замовлення") {

  selectedQuantity.set(chatId, 1);

  await sendMessage(
    chatId,
    "🛒 Оберіть товар:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "КОБРА-1 МВС — 300", callback_data: "product_cobra_mvs" }],
          [{ text: "КОБРА-1Н 100 мл — 250", callback_data: "product_cobra100" }],
          [{ text: "ТЕРЕН-4 — 250", callback_data: "product_teren4" }],
          [{ text: "ТЕРЕН-4М — 290", callback_data: "product_teren4m" }],
          [{ text: "ТРИЗУБ-4 — 250", callback_data: "product_trizub4" }],
          [{ text: "КОБРА-1Н 50 мл — 200", callback_data: "product_cobra50" }]
		  [{ text: "ТЕРЕН-1Б 50 мл — 220", callback_data: "product_teren1b" }]
		]
      }
    }
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
📦 Умови накладного платежу:

💳 Оплата здійснюється при отриманні у відділенні Нової Пошти.

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
  text === "2️⃣ Накладний платіж (оплата при отриманні)"
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

💳 Оплата здійснюється при отриманні у відділенні Нової Пошти.`
      );
    }

    return;
  }

  // якщо це оформлення замовлення
  const payment =
  text === "2️⃣ Накладний платіж (оплата при отриманні)"
    ? "Накладний платіж"
    : "Повна оплата";

  selectedPayment.set(chatId, payment);

  await sendMessage(
  ADMIN_ID,
  `🆕 НОВЕ ЗАМОВЛЕННЯ

👤 ${order.name}
📞 ${order.phone}
🏙 ${order.city}
📦 ${order.delivery}
🛡 ${order.product}
💰 ${payment}`,
  {
    reply_markup: {
      inline_keyboard: [
  [
    {
      text: "📦 Створити ТТН",
      callback_data: `ttn_${chatId}`
    }
  ],
  [
    {
      text: "🚫 Заблокувати",
      callback_data: `blacklist_${chatId}`
    }
  ]
]
    }
  }
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
  await sendMessage(chatId, "Отримувач: Ковальчук О.");

  await sendMessage(
    chatId,
    "📸 Після оплати надішліть скріншот платежу",
    { reply_markup: mainKeyboard() }
  );
}

// якщо накладний
if (text === "2️⃣ Накладний платіж (оплата при отриманні)") {
//  selectedPayment.set(chatId, payment);
//  waitingPaymentProof.add(chatId);

  await sendMessage(
    chatId,
    `✅ Замовлення прийнято!

📦 Ви обрали накладний платіж.
Оплата здійснюється при отриманні у відділенні Нової Пошти.`,
    { reply_markup: mainKeyboard() }
);
	

 // await sendMessage(chatId, "4441 1144 4890 6972");
 // await sendMessage(chatId, "Отримувач: Ковальчук О.");

 // await sendMessage(
 //   chatId,
 //   "📸 Після оплати надішліть скріншот платежу",
 //   { reply_markup: mainKeyboard() }
 // );
}

console.log("PHONE BEFORE CRM =", order.phone, typeof order.phone);
	
updateCRM({
  telegramId: user.telegramId,
  username: user.username,
  profile: user.profile,
  source: user.source,

  name: order.name,
  phone: order.phone,
  city: order.city,
  delivery: order.delivery,
  product: order.product,

  payment,
  status: "🟢 Замовлення",
  comment: "Оформив замовлення"
});
  pendingOrders.delete(chatId);
  cart.delete(chatId);
waitingCustomerData.delete(chatId);
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
  const step = orderStep.get(chatId);

if (step) {

	  if (text === "❌ Скасувати") {

    orderStep.delete(chatId);
    orderDraft.delete(chatId);

    await sendMessage(
      chatId,
      "❌ Оформлення скасовано",
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }
	
  const draft =
    orderDraft.get(chatId) || {};

  if (step === "firstName") {

    draft.firstName = text;

    orderDraft.set(chatId, draft);
    orderStep.set(chatId, "lastName");

    await sendMessage(
      chatId,
      "👤 Введіть ваше прізвище:"
    );

    return;
  }

	console.log("CURRENT STEP =", step);
	
  if (step === "lastName") {

	  console.log("LASTNAME STEP WORKS");
console.log("TEXT =", text);

    draft.lastName = text;

    orderDraft.set(chatId, draft);
    orderStep.set(chatId, "phone");

    await sendMessage(
      chatId,
      "📞 Введіть номер телефону:"
    );

    return;
  }

  if (step === "phone") {

    const cleanPhone =
      text.replace(/\D/g, "");

    const validPhone =
      /^0\d{9}$/.test(cleanPhone) ||
      /^380\d{9}$/.test(cleanPhone);

    if (!validPhone) {

      await sendMessage(
        chatId,
        "❌ Невірний номер телефону.\n\nПриклад: 0971234567"
      );

      return;
    }

    draft.phone = cleanPhone;

    orderDraft.set(chatId, draft);
    orderStep.set(chatId, "city");

    await sendMessage(
      chatId,
      "🏙 Введіть місто:"
    );

    return;
  }

  if (step === "city") {

    draft.city = text;

    orderDraft.set(chatId, draft);
    orderStep.set(chatId, "delivery");

    await sendMessage(
      chatId,
      "📦 Введіть номер відділення або поштомату:"
    );

    return;
  }

  if (step === "delivery") {

    draft.delivery = text;

    const order = {
      name:
        `${draft.firstName} ${draft.lastName}`,
      phone: draft.phone,
      city: draft.city,
      delivery: draft.delivery,
      product: cart.get(chatId)
        ?.map(x => `${x.product} x${x.qty}`)
        .join(" | ")
    };

    pendingOrders.set(chatId, order);

    orderStep.delete(chatId);
    orderDraft.delete(chatId);

    await sendMessage(
      chatId,
      `✅ Дані отримано

👤 ${order.name}
📞 ${order.phone}
🏙 ${order.city}
📦 ${order.delivery}

💳 Оберіть спосіб оплати:`,
      {
        reply_markup: {
          keyboard: [
            [{ text: "1️⃣ Повна оплата" }],
            [{ text: "2️⃣ Накладний платіж (оплата при отриманні)" }]
          ],
          resize_keyboard: true
        }
      }
    );

    return;
  }
}
	
// вільне повідомлення

if (!waitingConsultant.has(chatId)) {
    return;
}

waitingConsultant.delete(chatId);

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
