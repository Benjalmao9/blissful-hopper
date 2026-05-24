require('dotenv').config();

module.exports = {
    discordToken: process.env.DISCORD_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 3000,
    defaultLanguage: 'es',
    defaultSpeed: false // false = normal, true = slow in google-tts-api
};
