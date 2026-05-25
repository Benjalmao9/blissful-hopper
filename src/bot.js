const { Client, GatewayIntentBits, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, getVoiceConnection } = require('@discordjs/voice');
const { EdgeTTS } = require('node-edge-tts');
const play = require('play-dl');
const ytdlExec = require('youtube-dl-exec');
const ytSearch = require('yt-search');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Settings that can be modified via Discord commands or Web Dashboard
let currentSettings = {
    voice: config.defaultVoice,
    autoChannelId: null // If set, any message here is spoken
};

// State
let connection = null;
const player = createAudioPlayer();
player.on('error', error => {
    console.error('AudioPlayer Error:', error.message);
    if (isPlayingMusic) {
        if (musicQueue.length > 0 && musicQueue[0].textChannel) {
            musicQueue[0].textChannel.send('❌ Hubo un error inesperado al reproducir el audio de esta canción. Saltando a la siguiente...');
        }
        musicQueue.shift();
        playNextSong();
    }
});
let activeGuild = null;
let activeVoiceChannel = null;
let musicQueue = [];
let isPlayingMusic = false;

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

let spotifyToken = null;
let spotifyTokenExpires = 0;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < spotifyTokenExpires) return spotifyToken;
    if (!config.spotifyClientId || !config.spotifyClientSecret) return null;

    try {
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(config.spotifyClientId + ':' + config.spotifyClientSecret).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });
        const data = await res.json();
        if (data.access_token) {
            spotifyToken = data.access_token;
            spotifyTokenExpires = Date.now() + (data.expires_in - 300) * 1000;
            return spotifyToken;
        }
    } catch (e) {
        console.error('Error fetching Spotify token:', e);
    }
    return null;
}

async function playTTS(text) {
    if (!connection || isPlayingMusic) return;
    
    try {
        const tts = new EdgeTTS({ voice: currentSettings.voice });
        // Use a temporary file for edge-tts
        const tempFileName = `tts_${crypto.randomBytes(4).toString('hex')}.mp3`;
        const tempFilePath = path.join(__dirname, '..', tempFileName);
        
        await tts.ttsPromise(text, tempFilePath);
        
        const resource = createAudioResource(tempFilePath);
        player.play(resource);
        
        // Clean up the temp file after it finishes playing
        player.once(AudioPlayerStatus.Idle, () => {
            if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
            }
        });
        
        // Let the web dashboard know a message was spoken
        stateChangeCallbacks.forEach(cb => cb({ type: 'tts_log', text, timestamp: new Date() }));
    } catch (error) {
        console.error('[Bot] Error jugando TTS:', error);
    }
}

async function playElevenLabs(text, voiceId, characterName, interaction) {
    if (!connection) return;
    try {
        await interaction.deferReply();
        
        if (!config.elevenLabsApiKey || !voiceId) {
            await interaction.editReply('No se ha configurado la API Key o el Voice ID de ElevenLabs en el archivo .env.');
            return;
        }

        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'xi-api-key': config.elevenLabsApiKey 
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2'
            })
        });
        
        if (!res.ok) {
            console.error('ElevenLabs error:', await res.text());
            await interaction.editReply('Error al generar la voz con ElevenLabs.');
            return;
        }

        const tempFileName = `elevenlabs_${crypto.randomBytes(4).toString('hex')}.mp3`;
        const tempFilePath = path.join(__dirname, '..', tempFileName);
        
        const arrayBuffer = await res.arrayBuffer();
        fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

        const resource = createAudioResource(tempFilePath);
        player.play(resource);
        
        player.once(AudioPlayerStatus.Idle, () => {
            if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
            }
        });
        
        await interaction.editReply(`Leyendo con ${characterName}: "${text}"`);
        stateChangeCallbacks.forEach(cb => cb({ type: 'tts_log', text, timestamp: new Date() }));
    } catch (error) {
        console.error('[Bot] Error jugando ElevenLabs:', error);
        await interaction.editReply('Ocurrió un error inesperado al usar ElevenLabs.');
    }
}

async function playNextSong() {
    if (musicQueue.length === 0) {
        isPlayingMusic = false;
        return;
    }
    isPlayingMusic = true;
    const song = musicQueue[0];
    
    try {
        let resource;
        if (song.url.includes('youtube.com') || song.url.includes('youtu.be')) {
            const stream = ytdlExec.exec(song.url, { 
                o: '-', 
                f: 'bestaudio', 
                limitRate: '1M' 
            }, { stdio: ['ignore', 'pipe', 'ignore'] });
            
            resource = createAudioResource(stream.stdout);
        } else {
            const stream = await play.stream(song.url);
            resource = createAudioResource(stream.stream, { inputType: stream.type });
        }
        
        player.play(resource);
        
        player.once(AudioPlayerStatus.Idle, () => {
            if (isPlayingMusic) {
                musicQueue.shift(); // remove finished song
                playNextSong(); // play next
            }
        });
    } catch (error) {
        console.error('Error playing song:', error);
        if (song.textChannel) {
            song.textChannel.send(`❌ Hubo un problema reproduciendo **${song.title}** (YouTube probablemente bloqueó el audio). Saltando a la siguiente...`);
        }
        if (isPlayingMusic) {
            musicQueue.shift();
            playNextSong();
        }
    }
}

// Handle Auto-TTS channel
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    if (currentSettings.autoChannelId && message.channel.id === currentSettings.autoChannelId) {
        // Skip slash commands typed in auto channel
        if (!message.content.startsWith('/') && !isPlayingMusic) {
            playTTS(message.content);
        }
    }
});

// Handle Slash Commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'join') {
        const channel = interaction.member?.voice?.channel;
        if (!channel) {
            await interaction.reply({ content: '¡Debes estar en un canal de voz primero!', ephemeral: true });
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
        await interaction.reply(`Unido al canal: ${channel.name}`);
        notifyStateChange();
    } else if (commandName === 'leave') {
        if (connection) {
            connection.destroy();
            connection = null;
            activeGuild = null;
            activeVoiceChannel = null;
            musicQueue = [];
            isPlayingMusic = false;
            await interaction.reply('Desconectado del canal de voz.');
            notifyStateChange();
        } else {
            await interaction.reply({ content: 'No estoy en un canal de voz.', ephemeral: true });
        }
    } else if (commandName === 'tts') {
        const text = interaction.options.getString('mensaje');
        if (!connection) {
            await interaction.reply({ content: 'No estoy en un canal de voz. Usa /join primero.', ephemeral: true });
            return;
        }
        if (isPlayingMusic) {
            await interaction.reply({ content: 'No puedo hablar ahorita, hay música sonando.', ephemeral: true });
            return;
        }
        await interaction.reply(`Leyendo: "${text}"`);
        playTTS(text);
    } else if (commandName === 'jefe') {
        const text = interaction.options.getString('mensaje');
        if (!connection) {
            await interaction.reply({ content: 'No estoy en un canal de voz. Usa /join primero.', ephemeral: true });
            return;
        }
        if (isPlayingMusic) {
            await interaction.reply({ content: 'No puedo hablar ahorita, hay música sonando.', ephemeral: true });
            return;
        }
        playElevenLabs(text, config.elevenLabsVoiceId, 'Jefe Maestro', interaction);
    } else if (commandName === 'rakan') {
        const text = interaction.options.getString('mensaje');
        if (!connection) {
            await interaction.reply({ content: 'No estoy en un canal de voz. Usa /join primero.', ephemeral: true });
            return;
        }
        if (isPlayingMusic) {
            await interaction.reply({ content: 'No puedo hablar ahorita, hay música sonando.', ephemeral: true });
            return;
        }
        playElevenLabs(text, config.elevenLabsVoiceIdRakan, 'Rakan', interaction);
    } else if (commandName === 'play') {
        const query = interaction.options.getString('cancion');
        if (!connection) {
            await interaction.reply({ content: 'No estoy en un canal de voz. Usa /join primero.', ephemeral: true });
            return;
        }
        await interaction.deferReply();
        
        try {
            let songInfo;
            if (query.startsWith('http')) {
                // If it is a playlist link, play-dl will fail video_info. 
                if (query.includes('spotify.com')) {
                    if (query.includes('/playlist/') || query.includes('/album/')) {
                        await interaction.editReply('❌ **Las Playlists y Álbumes de Spotify han sido bloqueados por la plataforma.** ¡Intenta mandarme una Playlist de YouTube, o el link de una sola canción de Spotify!');
                        return;
                    }

                    if (query.includes('/track/')) {
                        const token = await getSpotifyToken();
                        if (!token) {
                            await interaction.editReply('❌ No se pudo conectar a la API de Spotify. Revisa las credenciales.');
                            return;
                        }

                        try {
                            const trackId = query.split('/track/')[1].split('?')[0];
                            const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                            const data = await res.json();
                            
                            if (data.error || !data.name) {
                                console.error('Spotify API Error:', data.error);
                                await interaction.editReply('❌ Spotify rechazó la lectura de esta canción.');
                                return;
                            }

                            const trackQuery = `${data.name} ${data.artists[0]?.name || ''}`;
                            const searchResults = await ytSearch(trackQuery);
                            if (searchResults && searchResults.videos.length > 0) {
                                musicQueue.push({ title: searchResults.videos[0].title, url: searchResults.videos[0].url, textChannel: interaction.channel });
                                await interaction.channel.send(`✅ Se ha añadido **${data.name}** a la cola.`);
                                if (!isPlayingMusic) playNextSong();
                            } else {
                                await interaction.editReply('❌ No encontré la canción en YouTube.');
                            }
                            return;

                        } catch (e) {
                            console.error('Error fetching Spotify info:', e);
                            await interaction.editReply('❌ Hubo un error al conectar con Spotify.');
                            return;
                        }
                    }
                } else if (query.includes('soundcloud.com')) {
                    const info = await play.soundcloud(query);
                    songInfo = { title: info.name, url: query, textChannel: interaction.channel };
                } else {
                    const validation = await play.yt_validate(query);
                    if (validation === 'playlist') {
                        const playlist = await play.playlist_info(query, { incomplete: true });
                        const videos = await playlist.all_videos();
                        
                        let addedCount = 0;
                        for (const video of videos) {
                            if (video.title && video.url) {
                                musicQueue.push({ title: video.title, url: video.url, textChannel: interaction.channel });
                                addedCount++;
                            }
                        }
                        
                        await interaction.editReply(`🎵 Se han añadido **${addedCount}** canciones de la playlist **${playlist.title}** a la cola.`);
                        if (!isPlayingMusic) playNextSong();
                        return; // return early since we handled the queue internally
                    } else {
                        const info = await play.video_info(query);
                        songInfo = { title: info.video_details.title, url: info.video_details.url, textChannel: interaction.channel };
                    }
                }
            } else {
                const searchResults = await play.search(query, { limit: 1 });
                if (searchResults.length === 0) {
                    await interaction.editReply('No encontré ninguna canción con ese nombre.');
                    return;
                }
                songInfo = { title: searchResults[0].title, url: searchResults[0].url, textChannel: interaction.channel };
            }

            musicQueue.push(songInfo);
            await interaction.editReply(`🎵 Añadido a la cola: **${songInfo.title}**`);
            
            if (!isPlayingMusic) {
                playNextSong();
            }
        } catch (error) {
            console.error('Error in /play:', error);
            await interaction.editReply('Hubo un error al intentar reproducir la canción (quizás el link no es válido).');
        }
    } else if (commandName === 'skip') {
        if (!isPlayingMusic) {
            await interaction.reply('No hay música reproduciéndose actualmente.');
            return;
        }
        player.stop(); // Triggers Idle -> plays next
        await interaction.reply('⏭️ Canción saltada.');
    } else if (commandName === 'stop') {
        musicQueue = [];
        isPlayingMusic = false;
        player.stop();
        await interaction.reply('🛑 Música detenida y cola vaciada.');
    } else if (commandName === 'queue') {
        if (musicQueue.length === 0) {
            await interaction.reply('La cola de música está vacía.');
            return;
        }
        const queueString = musicQueue.map((song, index) => `${index === 0 ? '▶️' : `${index}.`} ${song.title}`).join('\n');
        await interaction.reply(`**Cola de reproducción:**\n${queueString}`);
    } else if (commandName === 'voice') {
        const newVoice = interaction.options.getString('voz');
        currentSettings.voice = newVoice;
        await interaction.reply(`Voz cambiada exitosamente.`);
        notifyStateChange();
    } else if (commandName === 'auto') {
        currentSettings.autoChannelId = interaction.channel.id;
        await interaction.reply(`Canal Auto-TTS configurado a este canal. Todo lo que escribas aquí será leído.`);
        notifyStateChange();
    }
});

// Detect when the bot is disconnected manually by a user
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.member.user.id === client.user.id && !newState.channelId) {
        connection = null;
        activeGuild = null;
        activeVoiceChannel = null;
        musicQueue = [];
        isPlayingMusic = false;
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
