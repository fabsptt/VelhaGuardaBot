require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    Routes,
    REST,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const eventos = new Map();

const tiers = [
    "4", "4.1", "4.2", "4.3", "4.4",
    "5", "5.1", "5.2", "5.3", "5.4",
    "6", "6.1", "6.2", "6.3", "6.4",
    "7", "7.1", "7.2", "7.3", "7.4",
    "8.0", "8.1", "8.2", "8.3", "8.4"
];

const command = new SlashCommandBuilder()
    .setName('conteudo')
    .setDescription('Criar conteúdo Albion')

    .addStringOption(option =>
        option.setName('tipo')
            .setDescription('Tipo de conteúdo')
            .setRequired(true)
            .addChoices(
                { name: 'AvaRoads', value: 'AvaRoads' },
                { name: 'DgGrupo', value: 'DgGrupo' },
                { name: 'Estática', value: 'Estática' },
                { name: 'Gank', value: 'Gank' },
                { name: 'Dg Avaloniana', value: 'Dg Avaloniana' },
                { name: 'Facção', value: 'Facção' },
                { name: 'HCE', value: 'HCE' },
                { name: 'ZvZ', value: 'ZvZ' }
            ))

    .addStringOption(option =>
        option.setName('saida')
            .setDescription('Cidade de saída')
            .setRequired(true)
            .addChoices(
                { name: 'Lymhurst', value: 'Lymhurst' },
                { name: 'Lymhurst Portal', value: 'Lymhurst Portal' },
                { name: 'Brecilien', value: 'Brecilien' }
            ))

    .addStringOption(option =>
        option.setName('data')
            .setDescription('Ex: 28/05/2026')
            .setRequired(true))

    .addStringOption(option =>
        option.setName('hora')
            .setDescription('Ex: 21:00')
            .setRequired(true))

    .addStringOption(option =>
        option.setName('tier')
            .setDescription('Tier obrigatório')
            .setRequired(true)
            .addChoices(
                ...tiers.map(t => ({ name: t, value: t }))
            ))

    .addIntegerOption(option =>
        option.setName('tanks')
            .setDescription('Número de tanks')
            .setRequired(true))

    .addIntegerOption(option =>
        option.setName('healers')
            .setDescription('Número de healers')
            .setRequired(true))

    .addIntegerOption(option =>
        option.setName('dps')
            .setDescription('Número de DPS')
            .setRequired(true));

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [command.toJSON()] }
        );

        console.log('Slash command registado.');
    } catch (error) {
        console.error(error);
    }
})();

client.once(Events.ClientReady, () => {
    console.log(`Bot online: ${client.user.tag}`);
});

function criarEmbed(evento) {
    return new EmbedBuilder()
        .setTitle(`⚔ ${evento.tipo}`)
        .setDescription(
`📍 Saída: ${evento.saida}
📅 Data: ${evento.data}
⏰ Hora: ${evento.hora}
🎯 Tier obrigatório: ${evento.tier}

🛡 Tanks (${evento.tanks.length}/${evento.maxTanks})
${evento.tanks.join('\n') || 'Nenhum'}

💚 Healers (${evento.healers.length}/${evento.maxHealers})
${evento.healers.join('\n') || 'Nenhum'}

⚔ DPS (${evento.dps.length}/${evento.maxDps})
${evento.dps.join('\n') || 'Nenhum'}
`
        )
        .setColor('Green');
}

client.on(Events.InteractionCreate, async interaction => {

    if (interaction.isChatInputCommand()) {

        const evento = {
            tipo: interaction.options.getString('tipo'),
            saida: interaction.options.getString('saida'),
            data: interaction.options.getString('data'),
            hora: interaction.options.getString('hora'),
            tier: interaction.options.getString('tier'),

            maxTanks: interaction.options.getInteger('tanks'),
            maxHealers: interaction.options.getInteger('healers'),
            maxDps: interaction.options.getInteger('dps'),

            tanks: [],
            healers: [],
            dps: []
        };

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tank')
                .setLabel('🛡 Tank')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('healer')
                .setLabel('💚 Healer')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('dps')
                .setLabel('⚔ DPS')
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId('sair')
                .setLabel('❌ Sair')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('cancelar')
                .setLabel('🗑 Cancelar')
                .setStyle(ButtonStyle.Secondary)
        );

        const msg = await interaction.reply({
            embeds: [criarEmbed(evento)],
            components: [buttons],
            fetchReply: true
        });

        eventos.set(msg.id, evento);
    }

    if (interaction.isButton()) {

        const evento = eventos.get(interaction.message.id);

        if (!evento) return;

        const nome = interaction.user.username;

        evento.tanks = evento.tanks.filter(x => x !== nome);
        evento.healers = evento.healers.filter(x => x !== nome);
        evento.dps = evento.dps.filter(x => x !== nome);

        if (interaction.customId === 'tank') {
            if (evento.tanks.length < evento.maxTanks)
                evento.tanks.push(nome);
        }

        if (interaction.customId === 'healer') {
            if (evento.healers.length < evento.maxHealers)
                evento.healers.push(nome);
        }

        if (interaction.customId === 'dps') {
            if (evento.dps.length < evento.maxDps)
                evento.dps.push(nome);
        }

        if (interaction.customId === 'cancelar') {
            await interaction.message.delete();
            eventos.delete(interaction.message.id);
            return;
        }

        await interaction.update({
            embeds: [criarEmbed(evento)]
        });
    }
});

client.login(process.env.TOKEN);
