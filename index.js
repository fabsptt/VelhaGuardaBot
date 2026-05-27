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
  Events,
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const conteudos = [
  "AvaRoads",
  "DgGrupo",
  "Estática",
  "Gank",
  "Facção",
  "HCE",
  "ZvZ",
];

const saidas = [
  "Lymhurst",
  "Lymhurst Portal",
  "Brecilien",
];

const tiers = [
  "4", "4.1", "4.2", "4.3", "4.4",
  "5", "5.1", "5.2", "5.3", "5.4",
  "6", "6.1", "6.2", "6.3", "6.4",
  "7", "7.1", "7.2", "7.3", "7.4",
  "8.0", "8.1", "8.2", "8.3", "8.4"
];

const command = new SlashCommandBuilder()
  .setName("conteudo")
  .setDescription("Criar conteúdo da guilda")
  .addStringOption(option =>
    option
      .setName("tipo")
      .setDescription("Tipo de conteúdo")
      .setRequired(true)
      .addChoices(...conteudos.map(c => ({ name: c, value: c })))
  )
  .addStringOption(option =>
    option
      .setName("saida")
      .setDescription("Cidade de saída")
      .setRequired(true)
      .addChoices(...saidas.map(s => ({ name: s, value: s })))
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
      .setDescription("Ex: 21:00")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("tier")
      .setDescription("Tier obrigatório")
      .setRequired(true)
      .addChoices(...tiers.map(t => ({ name: t, value: t })))
  );

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [command.toJSON()] }
    );

    console.log("Comando registado.");
  } catch (error) {
    console.error(error);
  }
})();

client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isChatInputCommand()) {

    const tipo = interaction.options.getString("tipo");
    const saida = interaction.options.getString("saida");
    const data = interaction.options.getString("data");
    const hora = interaction.options.getString("hora");
    const tier = interaction.options.getString("tier");

    const jogadores = {
      tank: [],
      healer: [],
      dps: []
    };

    const embed = new EmbedBuilder()
      .setTitle("📢 Conteúdo Velha Guarda")
      .setDescription(
`⚔ Tipo: ${tipo}
📍 Saída: ${saida}
📅 Data: ${data}
🕒 Hora: ${hora}
🎒 Tier obrigatório: ${tier}

🛡 Tanks (0)

✚ Healers (0)

⚔ DPS (0)`
      )
      .setColor("Green");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tank")
        .setLabel("Tank")
        .setEmoji("🛡")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("healer")
        .setLabel("Healer")
        .setEmoji("✚")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("dps")
        .setLabel("DPS")
        .setEmoji("⚔")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("sair")
        .setLabel("Sair")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cancelar")
        .setLabel("Cancelar")
        .setEmoji("🚫")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row]
    });

  }

  if (interaction.isButton()) {

    const member = interaction.member.displayName;

    await interaction.reply({
      content: `✅ ${member} clicou em ${interaction.customId}`,
      ephemeral: true
    });

  }

});

client.login(TOKEN);
