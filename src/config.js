require('dotenv').config();

module.exports = {
    discordToken: process.env.DISCORD_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenLabsVoiceIdRakan: process.env.ELEVENLABS_VOICE_ID_RAKAN,
    spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
    spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 3000,
    defaultVoice: 'es-MX-DaliaNeural',
};
