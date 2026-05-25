require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');

const commands = [
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Unir el bot a tu canal de voz'),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Desconectar el bot del canal de voz'),
    new SlashCommandBuilder()
        .setName('tts')
        .setDescription('El bot dirá el mensaje en el canal de voz')
        .addStringOption(option => 
            option.setName('mensaje')
                .setDescription('El texto que quieres que lea el bot')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('jefe')
        .setDescription('El bot dirá el mensaje con la voz del Jefe Maestro (Inglés)')
        .addStringOption(option => 
            option.setName('mensaje')
                .setDescription('El texto a leer')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('rakan')
        .setDescription('El bot dirá el mensaje con la voz de Rakan')
        .addStringOption(option => 
            option.setName('mensaje')
                .setDescription('El texto a leer')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('auto')
        .setDescription('Configurar el canal de texto actual para lectura automática (Auto-TTS)'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproducir una canción desde YouTube o Spotify')
        .addStringOption(option => 
            option.setName('cancion')
                .setDescription('El nombre de la canción o la URL')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Saltar a la siguiente canción en la cola'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Detener la música y vaciar la cola'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Ver las canciones que están en la cola'),
    new SlashCommandBuilder()
        .setName('voice')
        .setDescription('Cambiar la voz del bot')
        .addStringOption(option => 
            option.setName('voz')
                .setDescription('Selecciona una voz')
                .setRequired(true)
                .addChoices(
                    { name: '🇲🇽 Español (México) - Dalia (Femenina)', value: 'es-MX-DaliaNeural' },
                    { name: '🇲🇽 Español (México) - Jorge (Masculino)', value: 'es-MX-JorgeNeural' },
                    { name: '🇪🇸 Español (España) - Elvira (Femenina)', value: 'es-ES-ElviraNeural' },
                    { name: '🇪🇸 Español (España) - Álvaro (Masculino)', value: 'es-ES-AlvaroNeural' },
                    { name: '🇺🇸 Inglés (EE.UU.) - Guy (Masculino)', value: 'en-US-GuyNeural' }
                )
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
    try {
        console.log(`Iniciando actualización de ${commands.length} slash commands.`);
        
        const data = await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands },
        );

        console.log(`¡Éxito! Se recargaron ${data.length} slash commands.`);
    } catch (error) {
        console.error('Error al registrar comandos:', error);
    }
})();
