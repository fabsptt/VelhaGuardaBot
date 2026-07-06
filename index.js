require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

const eventos = new Map();

const tiers = [
    "4",
    "4.1",
    "4.2",
    "4.3",
    "4.4",
    "5",
    "5.1",
    "5.2",
    "5.3",
    "5.4",
    "6",
    "6.1",
    "6.2",
    "6.3",
    "6.4",
    "7",
    "7.1",
    "7.2",
    "7.3",
    "7.4",
    "8",
    "8.1",
    "8.2",
    "8.3",
    "8.4"
];

const command = new SlashCommandBuilder()
    .setName("conteudo")
    .setDescription("Criar conteúdo Albion")

    .addStringOption(option =>
        option
            .setName("tipo")
            .setDescription("Tipo de conteúdo")
            .setRequired(true)
            .addChoices(

                { name: "AvaRoads", value: "AvaRoads" },
                { name: "DgGrupo", value: "DgGrupo" },
                { name: "Estática", value: "Estática" },
                { name: "Mundo Aberto (Fama/Pve)", value: "Mundo Aberto (Fama/Pve)" },
                { name: "Mundo Aberto (PVP/Roaming)", value: "Mundo Aberto (PVP/Roaming)" },
                { name: "Cofres/Aranhas (Objetivos)", value: "Cofres/Aranhas (Objetivos)" },
                { name: "Hellgate 2v2", value: "Hellgate 2v2" },
                { name: "Hellgate 5v5", value: "Hellgate 5v5" },
                { name: "Arena de Cristal", value: "Arena de Cristal" },
                { name: "Liga de Cristal 5v5", value: "Liga de Cristal 5v5" },
                { name: "Liga de Cristal 20v20", value: "Liga de Cristal 20v20" },
                { name: "Depths", value: "Depths" },
                { name: "Gank", value: "Gank" },
                { name: "Caçadas", value: "Caçadas" },
                { name: "Transporte de Facção", value: "Transporte de Facção" },
                { name: "Dg Avaloniana", value: "Dg Avaloniana" },
                { name: "Facção", value: "Facção" },
                { name: "HCE", value: "HCE" },
                { name: "ZvZ", value: "ZvZ" }

            )
    )

    .addStringOption(option =>
        option
            .setName("saida")
            .setDescription("Cidade de saída")
            .setRequired(true)
            .addChoices(

                { name: "Lymhurst", value: "Lymhurst" },
                { name: "Lymhurst Portal", value: "Lymhurst Portal" },
                { name: "Brecilien", value: "Brecilien" }

            )
    )

    .addStringOption(option =>
        option
            .setName("data")
            .setDescription("Ex: 28/05/2026")
            .setRequired(true)
    )

    .addStringOption(option =>
        option
            .setName("hora")
            .setDescription("21:00")
            .setRequired(true)
    )

    .addStringOption(option =>
        option
            .setName("tier")
            .setDescription("Tier obrigatório")
            .setRequired(true)
            .addChoices(
                ...tiers.map(t => ({
                    name: t,
                    value: t
                }))
            )
    )

    .addIntegerOption(option =>
        option
            .setName("tanks")
            .setDescription("Número de Tanks")
            .setRequired(true)
    )

    .addIntegerOption(option =>
        option
            .setName("healers")
            .setDescription("Número de Healers")
            .setRequired(true)
    )

    .addIntegerOption(option =>
        option
            .setName("dps")
            .setDescription("Número de DPS")
            .setRequired(true)
    );

const rest = new REST({
    version: "10"
}).setToken(process.env.TOKEN);

(async () => {

    try {

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            {
                body: [command.toJSON()]
            }
        );

        console.log("Slash command registado.");

    } catch (err) {

        console.error(err);

    }

})();

client.once(Events.ClientReady, () => {

    console.log(`Bot online: ${client.user.tag}`);

});

const eventos = new Map();

/**
 * Configuração de cada tipo de conteúdo
 * - normal: usa tanks/healers/dps simples
 * - avaloniana: usa roles detalhadas
 */
const modosConteudo = {

    normal: (interaction) => ({
        tipo: interaction.options.getString("tipo"),
        saida: interaction.options.getString("saida"),
        data: interaction.options.getString("data"),
        hora: interaction.options.getString("hora"),
        tier: interaction.options.getString("tier"),

        roles: {
            tank: { nome: "🛡 Tank", max: interaction.options.getInteger("tanks"), jogadores: [] },
            healer: { nome: "💚 Healer", max: interaction.options.getInteger("healers"), jogadores: [] },
            dps: { nome: "⚔ DPS", max: interaction.options.getInteger("dps"), jogadores: [] }
        }
    }),

/**
 * DG AVALONIANA — sistema especial
 */
    avaloniana: (interaction) => ({
        tipo: "Dg Avaloniana",
        saida: interaction.options.getString("saida"),
        data: interaction.options.getString("data"),
        hora: interaction.options.getString("hora"),
        tier: interaction.options.getString("tier"),

        roles: {
            tank: { nome: "🛡 Tank", max: 1, jogadores: [] },
            offtank: { nome: "🛡 Off Tank", max: 1, jogadores: [] },
            healer: { nome: "💚 Main Healer", max: 1, jogadores: [] },
            shadow: { nome: "☠ Shadow Caller", max: 1, jogadores: [] },
            crystal: { nome: "⚔ Crystal Reaper", max: 99, jogadores: [] },
            healerdps: { nome: "💚 Healer DPS", max: 1, jogadores: [] },
            arcane: { nome: "🔮 Great Arcane Staff", max: 1, jogadores: [] },
            dps: { nome: "⚔ Other DPS", max: 99, jogadores: [] }
        }
    })

};

function criarEvento(interaction) {

    const tipo = interaction.options.getString("tipo");

    if (tipo === "Dg Avaloniana") {
        return modosConteudo.avaloniana(interaction);
    }

    return modosConteudo.normal(interaction);
}

function removerJogadorDeTodasAsRoles(evento, nome) {

    for (const role of Object.values(evento.roles)) {
        role.jogadores = role.jogadores.filter(x => x !== nome);
    }

}

function entrarNaRole(evento, roleId, nome) {

    const role = evento.roles[roleId];
    if (!role) return;

    if (role.jogadores.includes(nome)) return;

    if (role.jogadores.length >= role.max) return;

    role.jogadores.push(nome);

}

function criarEmbed(evento) {

    let desc =
`📍 Saída: ${evento.saida}
📅 Data: ${evento.data}
⏰ Hora: ${evento.hora}
🎯 Tier: ${evento.tier}

`;

    for (const role of Object.values(evento.roles)) {

        desc += `**${role.nome} (${role.jogadores.length}/${role.max})**
`;

        desc += role.jogadores.length > 0
            ? role.jogadores.join("\n")
            : "Nenhum";

        desc += "\n\n";
    }

    return new EmbedBuilder()
        .setTitle(`⚔ ${evento.tipo}`)
        .setDescription(desc)
        .setColor("Green");
}

function criarBotoes(evento) {

    const buttons = [];

    for (const roleId of Object.keys(evento.roles)) {

        const role = evento.roles[roleId];

        buttons.push(
            new ButtonBuilder()
                .setCustomId(roleId)
                .setLabel(role.nome)
                .setStyle(ButtonStyle.Primary)
        );

    }

    // botão sair sempre incluído
    buttons.push(
        new ButtonBuilder()
            .setCustomId("sair")
            .setLabel("❌ Sair")
            .setStyle(ButtonStyle.Secondary)
    );

    // Discord: máximo 5 botões por row
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(
            new ActionRowBuilder().addComponents(buttons.slice(i, i + 5))
        );
    }

    return rows;
}

async function enviarEvento(interaction, evento) {

    const msg = await interaction.reply({
        embeds: [criarEmbed(evento)],
        components: criarBotoes(evento),
        fetchReply: true
    });

    guardarEvento(msg, evento);

}

async function atualizarMensagem(interaction, evento) {

    await interaction.update({
        embeds: [criarEmbed(evento)],
        components: criarBotoes(evento)
    });

}

client.on(Events.InteractionCreate, async interaction => {

    // =========================
    // COMANDO /conteudo
    // =========================
    if (interaction.isChatInputCommand()) {

        const tipo = interaction.options.getString("tipo");

        let evento;

        if (tipo === "Dg Avaloniana") {
            evento = modosConteudo.avaloniana(interaction);
        } else {
            evento = modosConteudo.normal(interaction);
        }

        await enviarEvento(interaction, evento);
    }

    // =========================
    // BOTÕES
    // =========================
    if (interaction.isButton()) {

        const evento = eventos.get(interaction.message.id);
        if (!evento) return;

        const nome = interaction.member.displayName || interaction.user.username;

        // =========================
        // SAIR
        // =========================
        if (interaction.customId === "sair") {

            removerJogadorDeTodasAsRoles(evento, nome);

            return atualizarMensagem(interaction, evento);
        }

        // =========================
        // ENTRAR EM ROLE
        // =========================
        const role = evento.roles[interaction.customId];

        if (!role) return;

        // remove o jogador de todas as outras roles primeiro
        removerJogadorDeTodasAsRoles(evento, nome);

        // tenta entrar na role
        if (role.jogadores.length < role.max) {
            role.jogadores.push(nome);
        }

        await atualizarMensagem(interaction, evento);
    }
});

client.login(process.env.TOKEN);
