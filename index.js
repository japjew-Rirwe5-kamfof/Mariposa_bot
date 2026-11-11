
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys';

import pino from 'pino';
import qrcode from 'qrcode-terminal';

async function iniciarMariposa() {
  const { state, saveCreds } =
    await useMultiFileAuthState('sesion-mariposa');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log('🦋 Escanea el QR de Mariposa Bot:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('🦋 MARIPOSA BOT ESTÁ CONECTADA 💎');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        iniciarMariposa();
      } else {
        console.log('Sesión cerrada. Hay que volver a vincular.');
      }
    }
  });

  sock.ev.on('group-participants.update', async (event) => {
    if (event.action === 'add') {
      for (const user of event.participants) {
        await sock.sendMessage(event.id, {
          text: `🦋💜 ¡Bienvenido/a al grupo, @${user.split('@')[0]}!\n\nSoy MARIPOSA BOT 💎. ¡Disfruta nuestro grupo!`,
          mentions: [user]
        });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (!jid || !jid.endsWith('@g.us')) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text || '';

      if (!text.startsWith('!')) continue;

      const sender = msg.key.participant;
      const command = text.trim().split(/\s+/)[0].toLowerCase();

      let metadata;
      try {
        metadata = await sock.groupMetadata(jid);
      } catch {
        continue;
      }

      const participant = metadata.participants.find(
        p => p.id === sender
      );

      const isAdmin =
        participant?.admin === 'admin' ||
        participant?.admin === 'superadmin';

      if (['!abrir', '!cerrar', '!promo'].includes(command) && !isAdmin) {
        await sock.sendMessage(jid, {
          text: '🔒 Solo los administradores pueden usar ese comando.'
        });
        continue;
      }

      if (command === '!ayuda') {
        await sock.sendMessage(jid, {
          text: `🦋 MARIPOSA BOT 💎

!ayuda - Ver comandos
!abrir - Abrir el grupo
!cerrar - Cerrar el grupo
!promo texto - Publicar promoción

💜 Siempre protegiendo nuestro grupo.`
        });
      }

      if (command === '!cerrar') {
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, {
          text: '🔒 Grupo cerrado. Solo administradores pueden escribir. 🦋'
        });
      }

      if (command === '!abrir') {
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, {
          text: '💜 ¡Grupo abierto! Todos pueden participar. 🦋'
        });
      }

      if (command === '!promo') {
        const promo = text.slice(5).trim();
        if (!promo) {
          await sock.sendMessage(jid, {
            text: 'Escribe tu anuncio así: !promo Tu promoción'
          });
        } else {
          await sock.sendMessage(jid, {
            text: `🦋💎 MARIPOSA PROMOCIONES 💎🦋\n\n${promo}`
          });
        }
      }
    }
  });
}

iniciarMariposa().catch(console.error);
