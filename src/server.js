const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./config');

module.exports = function startServer(bot) {
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    // Serve static files from the 'public' directory
    app.use(express.static(path.join(__dirname, '../public')));

    wss.on('connection', (ws) => {
        // Send initial state upon connection
        ws.send(JSON.stringify({ type: 'state', data: bot.getState() }));

        // Handle messages from the client (web dashboard)
        ws.on('message', (message) => {
            try {
                const parsed = JSON.parse(message);
                if (parsed.type === 'update_settings') {
                    bot.updateSettings(parsed.data);
                } else if (parsed.type === 'trigger_tts') {
                    bot.triggerTTS(parsed.text);
                }
            } catch (err) {
                console.error('[Server] Error parsing WS message:', err);
            }
        });
    });

    // When the bot state changes, broadcast it to all connected WebSocket clients
    bot.onStateChange((newState) => {
        const payload = JSON.stringify({ 
            type: newState.type === 'tts_log' ? 'tts_log' : 'state', 
            data: newState 
        });
        
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    });

    server.listen(config.port, () => {
        console.log(`[Server] Web Dashboard escuchando en http://localhost:${config.port}`);
    });
};
