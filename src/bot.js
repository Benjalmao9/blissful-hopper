const { Client, GatewayIntentBits, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const config = require('./config');

// Settings that can be modified via Discord commands or Web Dashboard
let currentSettings = {
    language: config.defaultLanguage,
    speed: config.defaultSpeed,
    autoChannelId: null // If set, any message here is spoken
};

// State
let connection = null;
const player = createAudioPlayer();
let activeGuild = null;
let activeVoiceChannel = null;

// Callbacks for the web server to sync state
let stateChangeCallbacks = [];

function notifyStateChange() {
    stateChangeCallbacks.forEach(cb => cb(getBotState()));
}

function getBotState() {
    return {
        online: !!client.user,
        botName: client.user ? client.user.tag : 'Desconectado',
        avatarUrl: client.user ? client.user.displayAvatarURL() : '',
        guild: activeGuild ? activeGuild.name : 'Ninguno',
        voiceChannel: activeVoiceChannel ? activeVoiceChannel.name : 'Ninguno',
        settings: currentSettings
    };
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once(Events.ClientReady, c => {
    console.log(`[Bot] Listo! Logueado como ${c.user.tag}`);
    notifyStateChange();
});

async function playTTS(text) {
    if (!connection) return;
    
    try {
        const url = googleTTS.getAudioUrl(text, {
            lang: currentSettings.language,
            slow: currentSettings.speed,
            host: 'https://translate.google.com',
        });

        const resource = createAudioResource(url);
        player.play(resource);
        
        // Let the web dashboard know a message was spoken
        stateChangeCallbacks.forEach(cb => cb({ type: 'tts_log', text, timestamp: new Date() }));
    } catch (error) {
        console.error('[Bot] Error jugando TTS:', error);
    }
}

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // Handle auto-TTS channel
    if (currentSettings.autoChannelId && message.channel.id === currentSettings.autoChannelId) {
        if (!message.content.startsWith(config.prefix)) {
            playTTS(message.content);
            return;
        }
    }

    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'join') {
        const channel = message.member?.voice.channel;
        if (!channel) {
            message.reply('¡Debes estar en un canal de voz primero!');
            return;
        }

        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        connection.subscribe(player);
        activeGuild = channel.guild;
        activeVoiceChannel = channel;
        message.reply(`Unido al canal: ${channel.name}`);
        notifyStateChange();
    } else if (command === 'leave') {
        if (connection) {
            connection.destroy();
            connection = null;
            activeGuild = null;
            activeVoiceChannel = null;
            message.reply('Desconectado del canal de voz.');
            notifyStateChange();
        }
    } else if (command === 'tts') {
        const text = args.join(' ');
        if (!text) {
            message.reply('Debes proveer un mensaje. Ejemplo: !tts hola');
            return;
        }
        if (!connection) {
            message.reply('No estoy en un canal de voz. Usa !join primero.');
            return;
        }
        playTTS(text);
    } else if (command === 'lang') {
        const newLang = args[0];
        if (!newLang) {
            message.reply(`Idioma actual: ${currentSettings.language}`);
            return;
        }
        currentSettings.language = newLang;
        message.reply(`Idioma cambiado a: ${newLang}`);
        notifyStateChange();
    } else if (command === 'auto') {
        currentSettings.autoChannelId = message.channel.id;
        message.reply(`Canal Auto-TTS configurado a este canal. Todo lo que escribas aquí será leído.`);
        notifyStateChange();
    }
});

// Detect when the bot is disconnected manually by a user
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.member.user.id === client.user.id && !newState.channelId) {
        connection = null;
        activeGuild = null;
        activeVoiceChannel = null;
        notifyStateChange();
    }
});

module.exports = function startBot() {
    if (config.discordToken) {
        client.login(config.discordToken).catch(err => {
            console.error('[Bot] Error al hacer login (verifica tu token en .env):', err.message);
        });
    } else {
        console.warn('[Bot] No se encontró DISCORD_TOKEN en .env. El bot no se conectará.');
    }

    return {
        onStateChange: (callback) => {
            stateChangeCallbacks.push(callback);
            // send initial state immediately
            callback(getBotState());
        },
        getState: getBotState,
        updateSettings: (newSettings) => {
            currentSettings = { ...currentSettings, ...newSettings };
            notifyStateChange();
        },
        triggerTTS: (text) => {
            playTTS(text);
        }
    };
};
