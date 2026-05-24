const startServer = require('./src/server');
const startBot = require('./src/bot');

// Start the Discord Bot and get its instance
const bot = startBot();

// Start the Web Server and pass the bot instance for interaction
startServer(bot);

console.log('Starting application...');
