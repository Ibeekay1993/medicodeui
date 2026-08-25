const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

let isClientReady = false;
let latestQR = null;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: puppeteer.executablePath(),
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-accelerated-2d-canvas', 
            '--no-first-run', 
            '--no-zygote', 
            '--single-process', 
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('New QR Code generated! Please open the Render URL in your browser to scan it.');
    latestQR = qr;
});

client.on('ready', () => {
    console.log('WhatsApp Bot is ready and connected to your phone number!');
    isClientReady = true;
    latestQR = null;
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp Bot was disconnected:', reason);
    isClientReady = false;
});

client.initialize().catch(err => console.error('Failed to initialize client:', err));

// The client initialization is now handled above after connecting to the DB.

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

app.get('/', async (req, res) => {
    if (isClientReady) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                <h1 style="color: green;">Medicode WhatsApp Bot is Running!</h1>
                <p>Status: <b>Connected & Ready</b></p>
                <p>You can now send authorization messages from the dashboard.</p>
            </div>
        `);
    }
    
    if (latestQR) {
        try {
            // Generate a data URI for the QR code image
            const qrImage = await qrcode.toDataURL(latestQR);
            return res.send(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h1>Scan this QR Code with WhatsApp</h1>
                    <img src="${qrImage}" alt="QR Code" style="width: 300px; height: 300px; border: 1px solid #ccc; padding: 10px; border-radius: 10px;" />
                    <p style="color: #666; margin-top: 20px;">Status: Waiting for scan...</p>
                    <p style="font-size: 12px; color: #999;">This page will automatically refresh every 5 seconds.</p>
                </div>
                <script>
                    setTimeout(() => location.reload(), 5000);
                </script>
            `);
        } catch (err) {
            return res.send('Error generating QR code image.');
        }
    }
    
    return res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h1>Medicode WhatsApp Bot is starting up...</h1>
            <p>Please wait a few seconds and refresh for the QR code.</p>
        </div>
        <script>
            setTimeout(() => location.reload(), 3000);
        </script>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
