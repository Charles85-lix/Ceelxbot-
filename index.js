const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const pino = require("pino")
const qrcode = require("qrcode-terminal")

async function startBot() {
const { state, saveCreds } = await useMultiFileAuthState("session")

const sock = makeWASocket({
logger: pino({ level: "silent" }),
auth: state
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", (update) => {
const { connection, qr } = update

if (qr) {
console.log("Scan this QR in WhatsApp:")
qrcode.generate(qr, { small: true })
}

if (connection === "open") {
console.log("CeelxBot connected!")
}
})
}

startBot()
