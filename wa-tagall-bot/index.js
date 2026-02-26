const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require("@whiskeysockets/baileys")

const pino = require("pino")
const QRCode = require("qrcode-terminal")

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    browser: ["Ubuntu VPS", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  // QR LOGIN
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("\n📱 Scan QR ini di WhatsApp:\n")
      QRCode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ Bot berhasil terkoneksi!")
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      console.log("❌ Koneksi terputus. Reconnect:", shouldReconnect)

      if (shouldReconnect) {
        startBot()
      }
    }
  })

  // LISTENER PESAN
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    if (text.toLowerCase() === "!tagall") {
      const jid = msg.key.remoteJid

      if (!jid.endsWith("@g.us")) {
        return sock.sendMessage(jid, {
          text: "❌ Perintah ini hanya bisa digunakan di grup!"
        })
      }

      try {
        const metadata = await sock.groupMetadata(jid)
        const participants = metadata.participants

        const mentions = participants.map(p => p.id)

        let teks = "📢 *TAG ALL MEMBER*\n\n"

        for (let member of mentions) {
          teks += `@${member.split("@")[0]}\n`
        }

        await sock.sendMessage(jid, {
          text: teks,
          mentions: mentions
        })

      } catch (err) {
        console.log("Error:", err)
        sock.sendMessage(jid, { text: "❌ Gagal mengambil data member grup." })
      }
    }
  })
}

startBot()
