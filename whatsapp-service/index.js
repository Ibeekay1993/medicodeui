const express = require('express');
const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

function normalizePhoneNumber(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('phone_number is required');
  }

  if (digits.startsWith('234')) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+234${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }

  return `+${digits}`;
}

function sendMetaMessage(to, text) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const apiVersion = process.env.META_API_VERSION || 'v22.0';

  if (!accessToken || !phoneNumberId) {
    throw new Error('META_ACCESS_TOKEN and META_PHONE_NUMBER_ID must be set');
  }

  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  });

  const options = {
    hostname: 'graph.facebook.com',
    path: `/${apiVersion}/${phoneNumberId}/messages`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          let details = { message: data };
          try {
            details = JSON.parse(data);
          } catch (error) {
            // Keep the raw response text if parsing fails.
          }

          return reject(new Error(details.error?.message || `Meta API error ${res.statusCode}`));
        }

        try {
          resolve(JSON.parse(data));
        } catch (error) {
          resolve({ ok: true, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

app.post('/send-otp', async (req, res) => {
  try {
    const { phone_number, message, otp } = req.body;

    if (!phone_number || (!message && !otp)) {
      return res.status(400).json({ error: 'phone_number and message are required' });
    }

    const text = message || otp;
    const formattedNumber = normalizePhoneNumber(phone_number);
    const result = await sendMetaMessage(formattedNumber, text);

    return res.json({
      success: true,
      method: 'meta',
      phone_number: formattedNumber,
      message: text,
      result
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.message);
    return res.status(500).json({ error: error.message, method: 'meta' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'medicode-whatsapp-bot', method: 'meta' });
});

app.get('/', (req, res) => {
  res.send('Medicode WhatsApp Bot is running with Meta API!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
