const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

// Initialize the WhatsApp Client
// We use LocalAuth so it saves the session locally and you don't have to scan the QR code every time it restarts
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for running on platforms like Render
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    // This will generate a QR code in the Render terminal logs
    // You will need to check the Render logs and scan this with your phone
    console.log('SCAN THIS QR CODE WITH YOUR WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Bot is ready and connected to your phone number!');
    isClientReady = true;
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp Bot was disconnected:', reason);
    isClientReady = false;
});

client.initialize();

function normalizePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    
    if (!digits) throw new Error('phone_number is required');
    
    // Convert to WhatsApp format (number@c.us)
    if (digits.startsWith('234')) {
        return `${digits}@c.us`;
    }
    if (digits.length === 10) {
        return `234${digits}@c.us`;
    }
    if (digits.length === 11 && digits.startsWith('0')) {
        return `234${digits.slice(1)}@c.us`;
    }
    
    return `${digits}@c.us`;
}

app.post('/send-otp', async (req, res) => {
    try {
        const { phone_number, message, otp } = req.body;
        
        if (!phone_number || (!message && !otp)) {
            return res.status(400).json({ error: 'phone_number and message are required' });
        }

        if (!isClientReady) {
            return res.status(503).json({ error: 'WhatsApp client is not ready yet. Please scan the QR code in the server logs.' });
        }

        const text = message || otp;
        const chatId = normalizePhoneNumber(phone_number);
        
        // Send the message using your connected phone
        const result = await client.sendMessage(chatId, text);
        
        return res.json({
            success: true,
            method: 'whatsapp-web.js',
            phone_number: chatId,
            message: text,
            result: { id: result.id._serialized }
        });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error.message);
        return res.status(500).json({ error: error.message, method: 'whatsapp-web.js' });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'medicode-whatsapp-bot', 
        method: 'whatsapp-web.js',
        isReady: isClientReady
    });
});

app.get('/', (req, res) => {
    res.send(`Medicode WhatsApp Bot is running! Client Ready: ${isClientReady}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
