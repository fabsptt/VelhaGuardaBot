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
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
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

// -----------------------------------------------------------------------
// DEFINIÇÃO DAS FUNÇÕES (ROLES) POR TIPO DE CONTEÚDO
// -----------------------------------------------------------------------
// Para "Dg Avaloniana" as vagas são fixas (não pedimos tanks/healers/dps
// ao criar o evento), e o total de participantes está limitado a 20.
const ROLE_SETS = {
    'Dg Avaloniana': {
        globalCap: 20,
        roles: [
            { id: 'caller',        label: 'Caller',         emoji: '<:Truebolt:1512491138039287958>', max: 1,  style: ButtonStyle.Primary },
            { id: 'offtank',       label: 'Offtank',        emoji: '<:Incubus:1512491042891497642>',  max: 1,  style: ButtonStyle.Primary },
            { id: 'mainhealer',    label: 'MainHealer',     emoji: '<:Hallowfall:1512491167952932936>', max: 1,  style: ButtonStyle.Success },
            { id: 'shadowcaller',  label: 'ShadowCaller',   emoji: '<:Shadowcaller:1512491101968404631>', max: 1,  style: ButtonStyle.Primary },
            { id: 'greatarcane',   label: 'GreatArcane',    emoji: '<:Great_Arcane:1513526429667688458>', max: 1,  style: ButtonStyle.Primary },
            { id: 'crystalreaper', label: 'Crystal Reaper', emoji: '<:Crystal_Reaper:1513526314429190184>', max: 10, style: ButtonStyle.Danger },
            { id: 'outrosdps',     label: 'Outros Dps',     emoji: '<:Blazing:1512491011220443327>',  max: 10, style: ButtonStyle.Danger },
            { id: 'dpshealer',     label: 'Dps Healer',     emoji: '<:Hallowfall:1512491167952932936>', max: 1,  style: ButtonStyle.Success }
        ]
    }
};

// Todos os outros tipos usam o esquema genérico Tank / Healer / DPS,
// com os máximos definidos pelas opções do comando.
function criarRolesPorDefeito(interaction) {
    return [
        { id: 'tank',   label: 'Tank',   emoji: '🛡',  max: interaction.options.getInteger('tanks'),   style: ButtonStyle.Primary },
        { id: 'healer', label: 'Healer', emoji: '💚', max: interaction.options.getInteger('healers'), style: ButtonStyle.Success },
        { id: 'dps',    label: 'DPS',    emoji: '⚔',  max: interaction.options.getInteger('dps'),     style: ButtonStyle.Danger }
    ];
}

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
                { name: 'Mundo Aberto (Fama/Pve)', value: 'Mundo Aberto (Fama/Pve)' },
                { name: 'Mundo Aberto (PVP/Roaming)', value: 'Mundo Aberto (PVP/Roaming)' },
                { name: 'Cofres/Aranhas (Objetivos)', value: 'Cofres/Aranhas (Objetivos)' },
                { name: 'Hellgate 2v2', value: 'Hellgate 2v2' },
                { name: 'Hellgate 5v5', value: 'Hellgate 5v5' },
                { name: 'Arena de Cristal', value: 'Arena de Cristal' },
                { name: 'Liga de Cristal 5v5', value: 'Liga de Cristal 5v5' },
                { name: 'Liga de Cristal 20v20', value: 'Liga de Cristal 20v20' },
                { name: 'Depths', value: 'Depths' },
                { name: 'Gank', value: 'Gank' },
                { name: 'Caçadas', value: 'Caçadas' },
                { name: 'Transporte de Facção', value: 'Transporte de Faccão' },
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

    // Nota: estas 3 opções ficam opcionais porque "Dg Avaloniana" usa
    // vagas fixas e não precisa delas. Para os restantes tipos continuam
    // a ser validadas como obrigatórias no momento da execução.
    .addIntegerOption(option =>
        option.setName('tanks')
            .setDescription('Número de tanks (não aplicável a Dg Avaloniana)')
            .setRequired(false))

    .addIntegerOption(option =>
        option.setName('healers')
            .setDescription('Número de healers (não aplicável a Dg Avaloniana)')
            .setRequired(false))

    .addIntegerOption(option =>
        option.setName('dps')
            .setDescription('Número de DPS (não aplicável a Dg Avaloniana)')
            .setRequired(false));

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

function totalParticipantes(evento) {
    return evento.roles.reduce((total, role) => total + role.members.length, 0);
}

function criarEmbed(evento) {
    const secoes = evento.roles
        .map(role => `${role.emoji} ${role.label} (${role.members.length}/${role.max})\n${role.members.join('\n') || 'Nenhum'}`)
        .join('\n\n');

    const rodape = evento.globalCap
        ? `\n\n👥 Total: ${totalParticipantes(evento)}/${evento.globalCap}`
        : '';

    return new EmbedBuilder()
        .setTitle(`⚔ ${evento.tipo}`)
        .setDescription(
`📍 Saída: ${evento.saida}
📅 Data: ${evento.data}
⏰ Hora: ${evento.hora}
🎯 Tier obrigatório: ${evento.tier}

${secoes}${rodape}`
        )
        .setColor('Green');
}

function criarBotoes(evento) {
    const botoesRoles = evento.roles.map(role =>
        new ButtonBuilder()
            .setCustomId(role.id)
            .setLabel(role.label)
            .setEmoji(role.emoji)
            .setStyle(role.style)
    );

    const botaoSair = new ButtonBuilder()
        .setCustomId('sair')
        .setLabel('❌ Sair')
        .setStyle(ButtonStyle.Secondary);

    const todosBotoes = [...botoesRoles, botaoSair];

    // Discord permite no máximo 5 botões por linha.
    const linhas = [];
    for (let i = 0; i < todosBotoes.length; i += 5) {
        linhas.push(new ActionRowBuilder().addComponents(todosBotoes.slice(i, i + 5)));
    }
    return linhas;
}

client.on(Events.InteractionCreate, async interaction => {

    if (interaction.isChatInputCommand()) {

        const tipo = interaction.options.getString('tipo');
        const roleSet = ROLE_SETS[tipo];

        let roles;
        let globalCap;

        if (roleSet) {
            // Tipo com vagas fixas (ex: Dg Avaloniana)
            roles = roleSet.roles.map(r => ({ ...r, members: [] }));
            globalCap = roleSet.globalCap;
        } else {
            // Tipo genérico: tanks/healers/dps são obrigatórios aqui
            const tanks = interaction.options.getInteger('tanks');
            const healers = interaction.options.getInteger('healers');
            const dps = interaction.options.getInteger('dps');

            if (tanks === null || healers === null || dps === null) {
                await interaction.reply({
                    content: 'Para este tipo de conteúdo tens de indicar o número de tanks, healers e dps.',
                    ephemeral: true
                });
                return;
            }

            roles = criarRolesPorDefeito(interaction).map(r => ({ ...r, members: [] }));
            globalCap = undefined;
        }

        const evento = {
            tipo,
            saida: interaction.options.getString('saida'),
            data: interaction.options.getString('data'),
            hora: interaction.options.getString('hora'),
            tier: interaction.options.getString('tier'),
            roles,
            globalCap
        };

        const msg = await interaction.reply({
            embeds: [criarEmbed(evento)],
            components: criarBotoes(evento),
            fetchReply: true
        });

        eventos.set(msg.id, evento);
    }

    if (interaction.isButton()) {

        const evento = eventos.get(interaction.message.id);

        if (!evento) return;

        const nome = interaction.member.displayName || interaction.user.username;
        const jaInscritoEm = evento.roles.find(role => role.members.includes(nome));

        if (interaction.customId !== 'sair') {
            const role = evento.roles.find(r => r.id === interaction.customId);

            if (role && !(jaInscritoEm && jaInscritoEm.id === role.id)) {
                // Se o utilizador mudar de vaga, o total global não sobe,
                // por isso não conta a vaga antiga ao verificar o limite.
                const totalAtual = totalParticipantes(evento) - (jaInscritoEm ? 1 : 0);
                const abaixoDoLimiteGlobal = !evento.globalCap || totalAtual < evento.globalCap;

                if (role.members.length < role.max && abaixoDoLimiteGlobal) {
                    if (jaInscritoEm) {
                        jaInscritoEm.members = jaInscritoEm.members.filter(x => x !== nome);
                    }
                    role.members.push(nome);
                } else {
                    // Vaga cheia ou limite global atingido: avisa o utilizador
                    // sem alterar o embed (a interação só pode ter uma resposta).
                    await interaction.reply({
                        content: evento.globalCap && totalAtual >= evento.globalCap
                            ? 'O evento já atingiu o limite de 20 participantes.'
                            : 'Essa vaga já está preenchida.',
                        ephemeral: true
                    });
                    return;
                }
            }
        } else if (jaInscritoEm) {
            jaInscritoEm.members = jaInscritoEm.members.filter(x => x !== nome);
        }

        await interaction.update({
            embeds: [criarEmbed(evento)]
        });
    }
});

client.login(process.env.TOKEN);

