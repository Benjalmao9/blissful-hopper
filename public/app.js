const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}`;
let ws;
let isConnected = false;

// DOM Elements
const botStatus = document.getElementById('botStatus');
const valBotName = document.getElementById('valBotName');
const valGuild = document.getElementById('valGuild');
const valVoiceChannel = document.getElementById('valVoiceChannel');
const langSelect = document.getElementById('langSelect');
const speedSelect = document.getElementById('speedSelect');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const ttsInput = document.getElementById('ttsInput');
const btnSpeak = document.getElementById('btnSpeak');
const logsContainer = document.getElementById('logsContainer');

function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Conectado al servidor WebSocket');
        isConnected = true;
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'state') {
                updateDashboardState(message.data);
            } else if (message.type === 'tts_log') {
                appendLog(message.data);
            }
        } catch (error) {
            console.error('Error parseando mensaje:', error);
        }
    };

    ws.onclose = () => {
        console.log('Desconectado del servidor WebSocket. Reconectando en 3s...');
        isConnected = false;
        botStatus.classList.remove('online');
        botStatus.querySelector('.text').textContent = 'Desconectado';
        setTimeout(connectWebSocket, 3000);
    };
}

function updateDashboardState(state) {
    if (state.online) {
        botStatus.classList.add('online');
        botStatus.querySelector('.text').textContent = 'En Línea';
    } else {
        botStatus.classList.remove('online');
        botStatus.querySelector('.text').textContent = 'Fuera de Línea';
    }

    valBotName.textContent = state.botName;
    valGuild.textContent = state.guild;
    valVoiceChannel.textContent = state.voiceChannel;

    if (state.settings) {
        langSelect.value = state.settings.language;
        speedSelect.value = state.settings.speed.toString();
    }
}

function appendLog(logData) {
    // Remove empty state if it exists
    const emptyState = logsContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const time = new Date(logData.timestamp).toLocaleTimeString();
    
    entry.innerHTML = `
        <div class="log-time">${time}</div>
        <div class="log-text">"${logData.text}"</div>
    `;

    // Add to top
    logsContainer.prepend(entry);

    // Keep only last 20 logs
    while (logsContainer.children.length > 20) {
        logsContainer.lastChild.remove();
    }
}

// Event Listeners
btnSaveSettings.addEventListener('click', () => {
    if (!isConnected) return alert('No hay conexión con el servidor.');
    
    const newSettings = {
        language: langSelect.value,
        speed: speedSelect.value === 'true'
    };
    
    ws.send(JSON.stringify({
        type: 'update_settings',
        data: newSettings
    }));
    
    const originalText = btnSaveSettings.textContent;
    btnSaveSettings.textContent = '¡Guardado!';
    setTimeout(() => {
        btnSaveSettings.textContent = originalText;
    }, 2000);
});

function sendTTS() {
    const text = ttsInput.value.trim();
    if (!text) return;
    if (!isConnected) return alert('No hay conexión con el servidor.');

    ws.send(JSON.stringify({
        type: 'trigger_tts',
        text: text
    }));

    ttsInput.value = '';
}

btnSpeak.addEventListener('click', sendTTS);

ttsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendTTS();
    }
});

// Initialize connection
connectWebSocket();
