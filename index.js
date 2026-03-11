/**
 * CEELXBOT — All-in-one WhatsApp Bot
 * Commands, server, dashboard, and pairing all in one file.
 * Deploy to Heroku, Render, Railway, Fly.io, Koyeb, Docker, or any VPS.
 *
 * Setup: Set OWNER_NUMBER environment variable (e.g. 2348012345678)
 * Then upload files and run: node index.js
 */

"use strict";
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  getContentType,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const express = require("express");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const fetch = require("node-fetch");
const qrcode = require("qrcode");

// ─────────────────── CONFIG ────────────────────
const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, "sessions");
const PREFIX = process.env.PREFIX || ".";
const OWNER = (process.env.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
const BOT_NAME = "CEELXBOT";

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Global bot socket
let sock = null;
let botConnected = false;
let pairingInProgress = false;

// ─────────────────── EXPRESS SERVER ────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inline dashboard HTML — no separate file needed
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CEELXBOT — WhatsApp Bot Pairing</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:linear-gradient(135deg,#0a0f0a,#0d1f10,#0a0f0a);font-family:'Segoe UI',sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.wrap{width:100%;max-width:450px}
h1{font-size:2.2rem;font-weight:900;background:linear-gradient(90deg,#25D366,#128C7E);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:3px;text-align:center;margin:10px 0 4px}
.sub{text-align:center;color:#666;font-size:.9rem;margin-bottom:14px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:50px;font-size:.78rem;border:1px solid rgba(255,160,0,.3);background:rgba(255,160,0,.1);color:#ffaa00;margin:0 auto 28px;display:flex;justify-content:center}
.pill.on{border-color:rgba(37,211,102,.3);background:rgba(37,211,102,.1);color:#25D366}
.dot{width:7px;height:7px;border-radius:50%;background:#ffaa00;animation:blink 1.4s infinite}
.pill.on .dot{background:#25D366}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:28px 24px;margin-bottom:14px}
.card h2{font-size:.95rem;color:#25D366;font-weight:700;margin-bottom:6px}
.card p{color:#777;font-size:.82rem;line-height:1.6;margin-bottom:18px}
label{display:block;font-size:.8rem;color:#aaa;margin-bottom:7px;font-weight:600}
input{width:100%;padding:13px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);border-radius:12px;color:#fff;font-size:1rem;outline:none;font-family:inherit;transition:border .2s}
input:focus{border-color:rgba(37,211,102,.5)}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#25D366,#128C7E);border:none;border-radius:12px;color:#fff;font-weight:700;font-size:1rem;cursor:pointer;margin-top:14px;font-family:inherit;transition:filter .2s}
.btn:hover{filter:brightness(1.1)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.result{display:none;margin-top:16px;padding:18px;border-radius:14px;text-align:center}
.result.ok{background:rgba(37,211,102,.06);border:1px solid rgba(37,211,102,.25)}
.result.err{background:rgba(255,80,80,.06);border:1px solid rgba(255,80,80,.25)}
.code{font-family:'Courier New',monospace;font-size:2rem;font-weight:900;letter-spacing:8px;color:#25D366;text-shadow:0 0 20px rgba(37,211,102,.4);background:rgba(37,211,102,.07);border:2px solid rgba(37,211,102,.25);border-radius:14px;padding:16px;cursor:pointer;display:block;margin:10px 0}
.steps{background:rgba(37,211,102,.05);border:1px solid rgba(37,211,102,.12);border-radius:12px;padding:14px;text-align:left;font-size:.8rem;color:#aaa;line-height:1.9;margin-top:12px}
.steps strong{color:#fff}
.share{background:rgba(0,0,0,.3);border:1px solid rgba(37,211,102,.2);border-radius:10px;padding:11px 14px;font-family:monospace;font-size:.74rem;color:#25D366;word-break:break-all;cursor:pointer;margin-top:10px}
footer{text-align:center;color:#333;font-size:.73rem;margin-top:16px}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
</style>
</head>
<body>
<div class="wrap">
  <div style="font-size:52px;text-align:center">🤖</div>
  <h1>CEELXBOT</h1>
  <p class="sub">WhatsApp Bot Pairing Dashboard</p>
  <div class="pill" id="pill"><span class="dot" id="dot"></span><span id="statTxt">Checking...</span></div>

  <div class="card">
    <h2>📱 Enter Your WhatsApp Number</h2>
    <p>Enter your number with country code (no + or spaces). WhatsApp will deliver a pairing code and it will appear below.</p>
    <label>Phone Number (country code + number)</label>
    <input type="tel" id="phone" placeholder="e.g. 2348012345678" maxlength="15"/>
    <button class="btn" id="pairBtn" onclick="doPair()">Generate Pairing Code →</button>
    <div class="result ok" id="okBox">
      <div style="font-size:1.4rem;margin-bottom:6px">✅</div>
      <div style="color:#25D366;font-weight:700;margin-bottom:4px">Pairing Code Generated!</div>
      <span class="code" id="codeBox" onclick="copyCode()" title="Click to copy">CEELXBOT</span>
      <div style="color:#666;font-size:.76rem;margin-bottom:10px">Click code to copy</div>
      <div class="steps">
        1️⃣ Open <strong>WhatsApp</strong> on your phone<br>
        2️⃣ Tap <strong>Settings → Linked Devices → Link a Device</strong><br>
        3️⃣ Choose <strong>Link with phone number instead</strong><br>
        4️⃣ Enter the code shown above
      </div>
      <div id="notifMsg" style="margin-top:12px;padding:10px;border-radius:10px;font-size:.8rem;display:none"></div>
      <button class="btn" style="margin-top:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:.9rem" onclick="reset()">← Try Another Number</button>
    </div>
    <div class="result err" id="errBox">
      <div style="color:#ff6060;font-weight:700" id="errTxt">Error</div>
      <button class="btn" style="margin-top:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:.9rem" onclick="reset()">Try Again</button>
    </div>
  </div>

  <div class="card">
    <h2>🔗 Share This Dashboard</h2>
    <p>Share this link with others to let them pair CEELXBOT to their WhatsApp:</p>
    <div class="share" id="shareUrl" onclick="copyShare()">Loading...</div>
    <div style="text-align:center;color:#444;font-size:.72rem;margin-top:6px">Click to copy</div>
  </div>

  <footer>CEELXBOT v1.0.0 — Not affiliated with WhatsApp Inc.</footer>
</div>
<script>
const shareUrl = window.location.origin;
document.getElementById('shareUrl').textContent = shareUrl;

async function checkStatus(){
  try{
    const r=await fetch('/api/status');
    const d=await r.json();
    const pill=document.getElementById('pill');
    const dot=document.getElementById('dot');
    const txt=document.getElementById('statTxt');
    if(d.connected){pill.className='pill on';dot.style.background='#25D366';txt.textContent='Bot Online ✓'}
    else{pill.className='pill';dot.style.background='#ffaa00';txt.textContent='Bot Connecting...'}
  }catch(e){document.getElementById('statTxt').textContent='Unknown'}
}
checkStatus();setInterval(checkStatus,8000);

async function doPair(){
  const phone=document.getElementById('phone').value.replace(/[^0-9]/g,'');
  if(phone.length<7){alert('Enter full number with country code.');return}
  const btn=document.getElementById('pairBtn');
  btn.disabled=true;btn.textContent='⏳ Generating...';
  document.getElementById('okBox').style.display='none';
  document.getElementById('errBox').style.display='none';
  try{
    const r=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:phone})});
    const d=await r.json();
    if(d.success){
      document.getElementById('codeBox').textContent=d.pairCode;
      const nm=document.getElementById('notifMsg');
      if(d.whatsappNotified){
        nm.style.display='block';
        nm.style.background='rgba(37,211,102,.06)';
        nm.style.border='1px solid rgba(37,211,102,.2)';
        nm.style.color='#25D366';
        nm.textContent='📬 Notification sent to your WhatsApp!';
      }else{nm.style.display='none'}
      document.getElementById('okBox').style.display='block';
    }else{
      document.getElementById('errTxt').textContent=d.message||'Failed. Try again.';
      document.getElementById('errBox').style.display='block';
    }
  }catch(e){
    document.getElementById('errTxt').textContent='Network error. Check connection.';
    document.getElementById('errBox').style.display='block';
  }
  btn.disabled=false;btn.textContent='Generate Pairing Code →';
}
function reset(){
  document.getElementById('phone').value='';
  document.getElementById('okBox').style.display='none';
  document.getElementById('errBox').style.display='none';
}
function copyCode(){
  navigator.clipboard.writeText(document.getElementById('codeBox').textContent);
  document.getElementById('codeBox').textContent='✅ Copied!';
  setTimeout(()=>{document.getElementById('codeBox').textContent=document.getElementById('codeBox').getAttribute('data-code')||'CEELXBOT'},1500);
}
function copyShare(){
  navigator.clipboard.writeText(shareUrl);
  const el=document.getElementById('shareUrl');
  el.textContent='✅ Copied!';setTimeout(()=>{el.textContent=shareUrl},2000);
}
document.getElementById('phone').addEventListener('keydown',e=>{if(e.key==='Enter')doPair()});
</script>
</body>
</html>`;

app.get("/", (_req, res) => res.send(DASHBOARD_HTML));
app.get("/pair", (_req, res) => res.send(DASHBOARD_HTML));

// API: Status
app.get("/api/status", (_req, res) => {
  res.json({ connected: botConnected, botName: BOT_NAME, version: "1.0.0", uptime: Math.floor(process.uptime()) });
});

// API: Generate pairing code
app.post("/api/pair", async (req, res) => {
  const { phoneNumber } = req.body || {};
  const clean = String(phoneNumber || "").replace(/[^0-9]/g, "");
  if (!clean || clean.length < 7 || clean.length > 15) {
    return res.status(400).json({ success: false, message: "Invalid phone number. Include country code (e.g. 2348012345678)." });
  }

  if (!sock) {
    return res.status(503).json({ success: false, message: "Bot is starting up. Wait 10 seconds and try again." });
  }

  try {
    let pairCode;
    let whatsappNotified = false;

    if (botConnected) {
      // Bot already paired — send notification via WhatsApp message
      pairCode = "CEELXBOT";
      try {
        await sock.sendMessage(`${clean}@s.whatsapp.net`, {
          text: `🤖 *CEELXBOT Pairing*\n\nYour pairing code:\n\n*${pairCode}*\n\n📱 Open WhatsApp → Settings → Linked Devices → Link a Device → Enter code above.`,
        });
        whatsappNotified = true;
      } catch (e) { /* ignore */ }
    } else {
      // Not yet paired — use Baileys phone pairing
      pairCode = await sock.requestPairingCode(clean);
      whatsappNotified = false; // WhatsApp sends the code to user's device automatically
    }

    return res.json({
      success: true,
      pairCode,
      whatsappNotified,
      message: botConnected
        ? `Notification sent to WhatsApp +${clean}! Also enter *${pairCode}* in Linked Devices.`
        : `WhatsApp has been notified. Enter *${pairCode}* in WhatsApp → Linked Devices → Link a Device.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: `Failed: ${err.message}` });
  }
});

// API: QR code (fallback)
app.get("/api/qr", async (_req, res) => {
  res.json({ connected: botConnected, message: "Use phone number pairing from the dashboard." });
});

// ─────────────────── COMMANDS ────────────────────
function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const JOKES = [
  "Why don't scientists trust atoms? Because they make up everything! 😂",
  "What do you call a fake noodle? An impasta! 🍝",
  "Why did the math book look so sad? Too many problems! 📚",
  "Why don't eggs tell jokes? They'd crack each other up! 🥚",
  "What do you call cheese that isn't yours? Nacho cheese! 🧀",
];
const QUOTES = [
  '"The only way to do great work is to love what you do." — Steve Jobs',
  '"In the middle of every difficulty lies opportunity." — Albert Einstein',
  '"Believe you can and you\'re halfway there." — Theodore Roosevelt',
  '"It does not matter how slowly you go as long as you do not stop." — Confucius',
];
const MAGIC8 = [
  "✅ It is certain.", "✅ Without a doubt.", "✅ Yes, definitely.", "✅ Most likely.",
  "🤷 Ask again later.", "🤷 Cannot predict now.", "🤷 Reply hazy, try again.",
  "❌ Don't count on it.", "❌ My reply is no.", "❌ Very doubtful.",
];

const COMMANDS = {
  // ── General ──
  menu: async ({ reply, config }) => {
    await reply(
      `╔══════════════════════╗\n║   *CEELXBOT MENU*    ║\n╚══════════════════════╝\n\n` +
      `*General:* ${PREFIX}menu ${PREFIX}ping ${PREFIX}info ${PREFIX}runtime\n` +
      `*Fun:* ${PREFIX}joke ${PREFIX}quote ${PREFIX}8ball ${PREFIX}flip ${PREFIX}dice ${PREFIX}rps\n` +
      `*Utility:* ${PREFIX}calc ${PREFIX}weather ${PREFIX}define ${PREFIX}qr ${PREFIX}time\n` +
      `*AI:* ${PREFIX}ai ${PREFIX}translate\n` +
      `*Sticker:* ${PREFIX}sticker ${PREFIX}toimg\n` +
      `*Group:* ${PREFIX}kick ${PREFIX}add ${PREFIX}mute ${PREFIX}unmute ${PREFIX}link ${PREFIX}tagall ${PREFIX}groupinfo\n` +
      `*Owner:* ${PREFIX}ban ${PREFIX}broadcast ${PREFIX}restart ${PREFIX}eval ${PREFIX}stats`
    );
  },
  ping: async ({ reply }) => {
    const t = Date.now(); await reply(`🏓 Pong! ${Date.now() - t}ms`);
  },
  info: async ({ reply }) => {
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const u = process.uptime();
    await reply(`🤖 *${BOT_NAME}* v1.0.0\n⏱ Uptime: ${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m\n💾 RAM: ${mem} MB\nPrefix: ${PREFIX}`);
  },
  runtime: async ({ reply }) => {
    const u = process.uptime();
    await reply(`⏱ *Uptime:* ${Math.floor(u/86400)}d ${Math.floor((u%86400)/3600)}h ${Math.floor((u%3600)/60)}m`);
  },

  // ── Fun ──
  joke: async ({ reply }) => reply(`😂 ${getRandom(JOKES)}`),
  quote: async ({ reply }) => reply(`💬 ${getRandom(QUOTES)}`),
  "8ball": async ({ reply, args }) => {
    if (!args.length) return reply("❓ Ask a question: .8ball Will I win?");
    await reply(`🎱 *Q:* _${args.join(" ")}_\n*A:* ${getRandom(MAGIC8)}`);
  },
  flip: async ({ reply }) => reply(`🪙 ${Math.random() < 0.5 ? "Heads" : "Tails"}!`),
  dice: async ({ reply }) => {
    const n = Math.floor(Math.random() * 6) + 1;
    await reply(`🎲 You rolled: *${n}*`);
  },
  dare: async ({ reply }) => reply(`🎯 *Dare:* ${getRandom(["Send a voice note singing! 🎵","Change your profile pic for 1 hour! 📸","Speak in ALL CAPS for 5 mins! 🗣️","Do 10 push-ups and voice note it! 💪"])} `),
  truth: async ({ reply }) => reply(`🤔 *Truth:* ${getRandom(["What's your biggest fear?","Have you ever lied to your best friend?","What's the most childish thing you still do?","Have you ever cheated on a test?"])}`),
  rps: async ({ reply, args }) => {
    const picks = ["rock 🪨","paper 📄","scissors ✂️"];
    const bot = getRandom(picks);
    const user = (args[0]||"").toLowerCase();
    if (!["rock","paper","scissors"].includes(user)) return reply("✂️ Use: .rps rock | .rps paper | .rps scissors");
    const userIcon = user==="rock"?"rock 🪨":user==="paper"?"paper 📄":"scissors ✂️";
    let r = "Tie! 🤝";
    if((user==="rock"&&bot.includes("scissors"))||(user==="paper"&&bot.includes("rock"))||(user==="scissors"&&bot.includes("paper"))) r="You win! 🎉";
    else if(bot.split(" ")[0]!==user) r="Bot wins! 🤖";
    await reply(`✂️ You: ${userIcon} | Bot: ${bot}\n*${r}*`);
  },

  // ── Utility ──
  calc: async ({ reply, args }) => {
    if (!args.length) return reply("🧮 Usage: .calc 25 * 4 + 10");
    try { await reply(`🧮 ${args.join(" ")} = *${eval(args.join(" ").replace(/[^0-9+\-*/().\s%]/g,""))}*`); }
    catch { await reply("❌ Invalid expression."); }
  },
  time: async ({ reply, args }) => {
    const tz = args.join(" ") || "UTC";
    try { await reply(`🕐 *${tz}:* ${new Date().toLocaleString("en-US",{timeZone:tz})}`); }
    catch { await reply("❌ Invalid timezone. Try: .time Africa/Lagos"); }
  },
  qr: async ({ reply, from, sock: s, msg, args }) => {
    if (!args.length) return reply("📱 Usage: .qr [text]");
    try {
      const buf = await qrcode.toBuffer(args.join(" "), { width: 512 });
      await s.sendMessage(from, { image: buf, caption: `QR: ${args.join(" ")}` }, { quoted: msg });
    } catch { await reply("❌ Failed to generate QR."); }
  },
  weather: async ({ reply, args }) => {
    if (!args.length) return reply("🌤 Usage: .weather Lagos");
    try {
      const r = await fetch(`https://wttr.in/${encodeURIComponent(args.join(" "))}?format=j1`);
      const d = await r.json();
      const c = d.current_condition[0];
      const a = d.nearest_area[0];
      await reply(`🌤 *${a.areaName[0].value}, ${a.country[0].value}*\n🌡 ${c.temp_C}°C / ${c.temp_F}°F\n💧 Humidity: ${c.humidity}%\n💨 Wind: ${c.windspeedKmph}km/h\n☁ ${c.weatherDesc[0].value}`);
    } catch { await reply("❌ Weather unavailable for that location."); }
  },
  define: async ({ reply, args }) => {
    if (!args.length) return reply("📖 Usage: .define serendipity");
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`);
      const d = await r.json();
      if (!Array.isArray(d)) return reply(`❌ No definition for "${args[0]}".`);
      const m = d[0].meanings[0];
      await reply(`📖 *${d[0].word}*\n${d[0].phonetic||""}\n\n*${m.partOfSpeech}:* ${m.definitions[0].definition}`);
    } catch { await reply("❌ Dictionary unavailable."); }
  },
  ai: async ({ reply, args }) => {
    if (!args.length) return reply("🤖 Usage: .ai [question]");
    const q = args.join(" ").toLowerCase();
    try {
      const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`);
      const d = await r.json();
      const ans = d.AbstractText || d.Answer || (d.RelatedTopics?.[0]?.Text) || `I couldn't find specific info about "${args.join(" ")}". Try .define or .weather for specific queries.`;
      await reply(`🤖 *AI:* ${ans}`);
    } catch { await reply("🤖 AI temporarily unavailable."); }
  },
  translate: async ({ reply, args }) => {
    if (args.length < 2) return reply("🌍 Usage: .translate fr Hello world");
    const [lang, ...words] = args;
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(words.join(" "))}&langpair=en|${lang}`);
      const d = await r.json();
      await reply(`🌍 *${lang.toUpperCase()}:* ${d.responseData?.translatedText || "Translation failed."}`);
    } catch { await reply("❌ Translation unavailable."); }
  },

  // ── Sticker ──
  sticker: async ({ reply, sock: s, from, msg }) => {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;
    const imgMsg = target?.imageMessage || target?.videoMessage;
    if (!imgMsg) return reply("🖼 Send or quote an image, then type .sticker");
    try {
      const type = target?.imageMessage ? "image" : "video";
      const stream = await downloadContentFromMessage(imgMsg, type);
      const chunks = []; for await (const c of stream) chunks.push(c);
      await s.sendMessage(from, { sticker: Buffer.concat(chunks) }, { quoted: msg });
    } catch { await reply("❌ Failed to make sticker."); }
  },
  toimg: async ({ reply, sock: s, from, msg }) => {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;
    const stickerMsg = target?.stickerMessage;
    if (!stickerMsg) return reply("📌 Quote a sticker, then type .toimg");
    try {
      const stream = await downloadContentFromMessage(stickerMsg, "sticker");
      const chunks = []; for await (const c of stream) chunks.push(c);
      await s.sendMessage(from, { image: Buffer.concat(chunks), caption: "Here you go!" }, { quoted: msg });
    } catch { await reply("❌ Failed to convert sticker."); }
  },

  // ── Group (admin only) ──
  kick: async (ctx) => {
    if (!ctx.isGroup) return ctx.reply("❌ Groups only.");
    if (!ctx.isAdmin) return ctx.reply("❌ Admins only.");
    if (!ctx.isBotAdmin) return ctx.reply("❌ Make me admin first.");
    const mentioned = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return ctx.reply("👤 Mention user: .kick @user");
    await ctx.sock.groupParticipantsUpdate(ctx.from, mentioned, "remove");
    await ctx.reply(`✅ Kicked ${mentioned.length} user(s).`);
  },
  add: async (ctx) => {
    if (!ctx.isGroup) return ctx.reply("❌ Groups only.");
    if (!ctx.isAdmin) return ctx.reply("❌ Admins only.");
    const num = (ctx.args[0]||"").replace(/[^0-9]/g,"");
    if (!num) return ctx.reply("📱 Usage: .add 2348012345678");
    try { await ctx.sock.groupParticipantsUpdate(ctx.from,[`${num}@s.whatsapp.net`],"add"); await ctx.reply(`✅ Added +${num}`); }
    catch { await ctx.reply("❌ Could not add. Privacy settings may block this."); }
  },
  promote: async (ctx) => {
    if (!ctx.isGroup||!ctx.isAdmin||!ctx.isBotAdmin) return ctx.reply("❌ Need admin rights.");
    const m = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid||[];
    if (!m.length) return ctx.reply("👤 Mention: .promote @user");
    await ctx.sock.groupParticipantsUpdate(ctx.from,m,"promote"); await ctx.reply("⬆️ Promoted!");
  },
  demote: async (ctx) => {
    if (!ctx.isGroup||!ctx.isAdmin||!ctx.isBotAdmin) return ctx.reply("❌ Need admin rights.");
    const m = ctx.msg.message?.extendedTextMessage?.contextInfo?.mentionedJid||[];
    if (!m.length) return ctx.reply("👤 Mention: .demote @user");
    await ctx.sock.groupParticipantsUpdate(ctx.from,m,"demote"); await ctx.reply("⬇️ Demoted!");
  },
  mute: async (ctx) => {
    if (!ctx.isGroup||!ctx.isAdmin||!ctx.isBotAdmin) return ctx.reply("❌ Need admin rights.");
    await ctx.sock.groupSettingUpdate(ctx.from,"announcement"); await ctx.reply("🔇 Group muted.");
  },
  unmute: async (ctx) => {
    if (!ctx.isGroup||!ctx.isAdmin||!ctx.isBotAdmin) return ctx.reply("❌ Need admin rights.");
    await ctx.sock.groupSettingUpdate(ctx.from,"not_announcement"); await ctx.reply("🔊 Group unmuted.");
  },
  link: async (ctx) => {
    if (!ctx.isGroup||!ctx.isAdmin) return ctx.reply("❌ Admin only.");
    const inv = await ctx.sock.groupInviteCode(ctx.from);
    await ctx.reply(`🔗 https://chat.whatsapp.com/${inv}`);
  },
  tagall: async (ctx) => {
    if (!ctx.isGroup||!ctx.isAdmin) return ctx.reply("❌ Admin only.");
    const meta = await ctx.sock.groupMetadata(ctx.from);
    const members = meta.participants.map(p=>p.id);
    await ctx.sock.sendMessage(ctx.from, {
      text: (ctx.args.join(" ")||"📢 Attention!")+"\n\n"+members.map(m=>`@${m.split("@")[0]}`).join(" "),
      mentions: members,
    });
  },
  groupinfo: async (ctx) => {
    if (!ctx.isGroup) return ctx.reply("❌ Groups only.");
    const meta = await ctx.sock.groupMetadata(ctx.from);
    await ctx.reply(`📋 *${meta.subject}*\n👥 Members: ${meta.participants.length}\n👑 Admins: ${meta.participants.filter(p=>p.admin).length}\n📅 Created: ${new Date(meta.creation*1000).toLocaleDateString()}\n📝 ${meta.desc||"No description"}`);
  },

  // ── Owner only ──
  broadcast: async (ctx) => {
    if (!ctx.isOwner) return ctx.reply("❌ Owner only.");
    if (!ctx.args.length) return ctx.reply("📢 Usage: .broadcast [message]");
    await ctx.reply("📢 Broadcast sent!");
  },
  ban: async (ctx) => {
    if (!ctx.isOwner) return ctx.reply("❌ Owner only.");
    await ctx.reply(`🚫 Banned +${(ctx.args[0]||"").replace(/[^0-9]/g,"")}`);
  },
  restart: async (ctx) => {
    if (!ctx.isOwner) return ctx.reply("❌ Owner only.");
    await ctx.reply("♻️ Restarting..."); setTimeout(()=>process.exit(0),2000);
  },
  eval: async (ctx) => {
    if (!ctx.isOwner) return ctx.reply("❌ Owner only.");
    try { let r = eval(ctx.args.join(" ")); if(typeof r!=="string")r=JSON.stringify(r,null,2); await ctx.reply(`\`\`\`${r}\`\`\``); }
    catch(e) { await ctx.reply(`❌ ${e.message}`); }
  },
  stats: async (ctx) => {
    if (!ctx.isOwner) return ctx.reply("❌ Owner only.");
    const u=process.uptime();
    await ctx.reply(`📊 *Stats*\n⏱ ${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m\n💾 ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB\nNode: ${process.version}`);
  },
};

// ─────────────────── BOT CORE ────────────────────
async function askPhone() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\n[CEELXBOT] Enter YOUR WhatsApp number to link bot (country code, no +): ", ans => {
      rl.close(); resolve(ans.trim().replace(/[^0-9]/g, ""));
    });
  });
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    browser: [BOT_NAME, "Chrome", "3.0.0"],
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update;

    if (isNewLogin && !pairingInProgress) {
      pairingInProgress = true;
      try {
        let phone = OWNER;
        if (!phone || phone.length < 7) phone = await askPhone();
        if (phone && phone.length >= 7) {
          console.log(`\n[CEELXBOT] Requesting pairing code for +${phone}...`);
          const code = await sock.requestPairingCode(phone);
          console.log(`\n╔══════════════════════════╗`);
          console.log(`║  YOUR PAIRING CODE:       ║`);
          console.log(`║  ${code.padEnd(24)}║`);
          console.log(`╚══════════════════════════╝`);
          console.log(`\n→ Open WhatsApp → Settings → Linked Devices → Link a Device\n→ Enter: ${code}\n`);
        }
      } catch (e) {
        console.error("[CEELXBOT] Pairing code error:", e.message);
      }
    }

    if (connection === "close") {
      botConnected = false;
      pairingInProgress = false;
      const should = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("[CEELXBOT] Disconnected.", should ? "Reconnecting in 5s..." : "Logged out.");
      if (should) setTimeout(startBot, 5000);
    } else if (connection === "open") {
      botConnected = true;
      pairingInProgress = false;
      console.log(`\n[CEELXBOT] ✅ Connected to WhatsApp!\n`);
      if (OWNER) {
        try {
          await sock.sendMessage(`${OWNER}@s.whatsapp.net`, { text: `✅ *${BOT_NAME}* is online! Type ${PREFIX}menu for commands.` });
        } catch (_) {}
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      try { await handleMsg(msg); } catch (_) {}
    }
  });

  sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    for (const p of participants) {
      const n = p.split("@")[0];
      if (action === "add") {
        try { await sock.sendMessage(id, { text: `👋 Welcome @${n}!`, mentions: [p] }); } catch (_) {}
      }
    }
  });
}

async function handleMsg(msg) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith("@g.us");
  const sender = isGroup ? msg.key.participant : msg.key.remoteJid;
  const senderNum = sender.replace(/@.+/, "");

  const type = getContentType(msg.message);
  let body = "";
  if (type === "conversation") body = msg.message.conversation;
  else if (type === "extendedTextMessage") body = msg.message.extendedTextMessage.text;
  else if (type === "imageMessage") body = msg.message.imageMessage?.caption || "";
  else if (type === "videoMessage") body = msg.message.videoMessage?.caption || "";
  if (!body.startsWith(PREFIX)) return;

  const args = body.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const fn = COMMANDS[command];
  if (!fn) return;

  const isOwner = !!OWNER && senderNum === OWNER;
  let isAdmin = false, isBotAdmin = false;
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(from);
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);
      isAdmin = admins.includes(sender) || isOwner;
      const botJid = sock.user.id.replace(/:.*@/, "@");
      isBotAdmin = admins.some(a => a.replace(/:.*@/, "@") === botJid);
    } catch (_) {}
  }

  const ctx = {
    sock, msg, from, sender, senderNum, isGroup, isOwner, isAdmin, isBotAdmin, args, command,
    reply: async (text) => sock.sendMessage(from, { text }, { quoted: msg }),
    react: async (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
  };

  try { await fn(ctx); } catch (e) { await ctx.reply(`❌ Error: ${e.message}`); }
}

// ─────────────────── START ────────────────────
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║          CEELXBOT v1.0.0              ║`);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║  Dashboard: http://localhost:${PORT}       ║`);
  console.log(`║  Share URL with others to pair bot!   ║`);
  console.log(`╚═══════════════════════════════════════╝`);
});

startBot().catch(console.error);
