import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import pino from 'pino';
import qrcode from 'qrcode';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const sessions = new Map();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function sanitizePhone(phone) {
  return phone?.replace(/\D/g, '');
}

async function setupSession(sessionId, mode, phoneNumber) {
  const sessionPath = path.join('/tmp', `baileys-${sessionId}`);
  await fs.mkdir(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const session = {
    id: sessionId,
    status: 'connecting',
    mode,
    phoneNumber,
    qr: null,
    error: null,
    socket: null,
    path: sessionPath
  };
  sessions.set(sessionId, session);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: ['AS - PFP THAT SHAPES YOU!', 'Safari', '1.0.0']
  });

  session.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qr = await qrcode.toDataURL(qr);
      session.status = 'waiting_for_scan';
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.error = null;
      session.qr = null;
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        session.status = 'logged_out';
      } else {
        session.status = 'disconnected';
      }
      session.error = lastDisconnect?.error?.message || 'Connection closed';
    }
  });

  if (mode === 'pairing' && phoneNumber) {
    const waitForConnection = setInterval(async () => {
      try {
        if (sock.authState.creds.registered) {
          clearInterval(waitForConnection);
          return;
        }

        const code = await sock.requestPairingCode(phoneNumber);
        session.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
        session.status = 'pairing_code_ready';
        clearInterval(waitForConnection);
      } catch (error) {
        session.error = error.message;
      }
    }, 1200);
  }

  return session;
}

app.post('/api/session', async (req, res) => {
  try {
    const { mode, phoneNumber } = req.body;
    if (!['qr', 'pairing'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be qr or pairing' });
    }

    const cleanedPhone = mode === 'pairing' ? sanitizePhone(phoneNumber) : null;
    if (mode === 'pairing' && !cleanedPhone) {
      return res.status(400).json({ error: 'Valid phone number is required for pairing mode' });
    }

    const sessionId = uuidv4();
    const session = await setupSession(sessionId, mode, cleanedPhone);

    return res.json({
      sessionId: session.id,
      status: session.status
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Failed to initialize session' });
  }
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.json({
    status: session.status,
    qr: session.qr,
    pairingCode: session.pairingCode || null,
    error: session.error
  });
});

app.post('/api/session/:sessionId/update-pfp', upload.single('image'), async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session || !session.socket) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.status !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp is not connected yet' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }

  try {
    const outputBuffer = await sharp(req.file.buffer)
      .resize(640, 640, { fit: 'fill' })
      .jpeg({ quality: 96 })
      .toBuffer();

    const jid = session.socket.user.id;
    await session.socket.updateProfilePicture(jid, outputBuffer);

    return res.json({ success: true, message: 'Profile picture updated successfully' });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: `Failed to update profile picture: ${error.message}` });
  }
});

app.delete('/api/session/:sessionId', async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.socket?.end();
  await fs.rm(session.path, { recursive: true, force: true });
  sessions.delete(req.params.sessionId);
  return res.json({ success: true });
});

app.listen(PORT, () => {
  logger.info(`AS - PFP THAT SHAPES YOU! running on port ${PORT}`);
});
