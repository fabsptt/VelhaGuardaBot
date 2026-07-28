require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

// IMPORTANTE: sem estes handlers, um erro no WebSocket (ligação ao Discord)
// faz o processo rebentar de imediato (exit code 1) sem mostrar a causa real,
// porque o Node trata um evento 'error' sem listener como exceção fatal.
client.on('error', (err) => {
    console.error('Erro no client do Discord:', err);
});

client.on('shardError', (err, shardId) => {
    console.error(`Erro no shard ${shardId}:`, err);
});

client.on('shardDisconnect', (event, shardId) => {
    console.warn(`Shard ${shardId} desligado. Código: ${event.code}`);
});

client.on('shardReconnecting', (shardId) => {
    console.log(`Shard ${shardId} a tentar reconectar...`);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});

let eventos = new Map();

// ID do canal #｢📊│ranking-analises (vem do .env, ver instruções no README).
const RANKING_CHANNEL_ID = process.env.RANKING_CHANNEL_ID;

const tiers = [
    "4", "4.1", "4.2", "4.3", "4.4",
    "5", "5.1", "5.2", "5.3", "5.4",
    "6", "6.1", "6.2", "6.3", "6.4",
    "7", "7.1", "7.2", "7.3", "7.4",
    "8.0", "8.1", "8.2", "8.3", "8.4"
];

// -----------------------------------------------------------------------
// ESTATÍSTICAS (persistência em ficheiro)
// -----------------------------------------------------------------------
// Guarda: (1) quem criou cada evento e em que semana, e (2) cada
// participação confirmada (1ª vez que alguém entra numa vaga de um evento).
// Isto permite calcular "quem puxou mais conteúdo" e o "top participantes"
// por semana ou no geral, mesmo depois de reiniciar o bot.
const STATS_FILE = path.join(__dirname, 'stats.json');

function loadStats() {
    try {
        const raw = fs.readFileSync(STATS_FILE, 'utf8');
        const data = JSON.parse(raw);
        return {
            eventos: Array.isArray(data.eventos) ? data.eventos : [],
            participacoes: Array.isArray(data.participacoes) ? data.participacoes : []
        };
    } catch (err) {
        return { eventos: [], participacoes: [] };
    }
}

function saveStats() {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (err) {
        console.error('Erro ao gravar stats.json:', err);
    }
}

// Devolve a semana ISO (ex: "2026-W30") de uma data, para agrupar por semana.
function getSemanaISO(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const stats = loadStats();

// -----------------------------------------------------------------------
// EVENTOS ATIVOS (persistência em ficheiro)
// -----------------------------------------------------------------------
// Sem isto, qualquer reinício do bot (deploy, crash, restart do hosting)
// apagava da memória todos os eventos com inscrições em curso: o embed
// ficava visível no Discord, mas os botões deixavam de fazer efeito
// (o bot já não sabia quem estava inscrito em quê) e as vagas
// preenchidas perdiam-se por completo. Agora o estado de cada evento é
// gravado a cada alteração e recarregado no arranque, tal como o stats.json.
const EVENTS_FILE = path.join(__dirname, 'eventos.json');

function loadEventos() {
    try {
        const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
        const data = JSON.parse(raw);
        const mapa = new Map();
        for (const [msgId, evento] of data) {
            mapa.set(msgId, {
                ...evento,
                // 'contabilizados' é um Set em memória mas o JSON só
                // consegue guardar arrays — reconstrói o Set ao carregar.
                contabilizados: new Set(evento.contabilizados || [])
            });
        }
        return mapa;
    } catch (err) {
        return new Map();
    }
}

function saveEventos() {
    try {
        const serializavel = Array.from(eventos.entries()).map(([msgId, evento]) => [
            msgId,
            { ...evento, contabilizados: Array.from(evento.contabilizados) }
        ]);
        fs.writeFileSync(EVENTS_FILE, JSON.stringify(serializavel, null, 2));
    } catch (err) {
        console.error('Erro ao gravar eventos.json:', err);
    }
}

eventos = loadEventos();

function registarEventoCriado(criadorId, criadorNome, tipo) {
    const agora = new Date();
    stats.eventos.push({
        criadorId,
        criadorNome,
        tipo,
        semana: getSemanaISO(agora),
        timestamp: agora.toISOString()
    });
    saveStats();
}

function registarParticipacao(userId, nome) {
    const agora = new Date();
    stats.participacoes.push({
        userId,
        nome,
        semana: getSemanaISO(agora),
        timestamp: agora.toISOString()
    });
    saveStats();
}

// -----------------------------------------------------------------------
// DEFINIÇÃO DAS FUNÇÕES (ROLES) POR TIPO DE CONTEÚDO
// -----------------------------------------------------------------------
// Para "Dg Avaloniana" as vagas são fixas (não pedimos tanks/healers/dps
// ao criar o evento), e o total de participantes está limitado a 20.
const ROLE_SETS = {
    'Dg Avaloniana': {
        globalCap: 20,
        // Estas são as 5 classes fixas que têm de estar todas preenchidas
        // para a dungeon poder avançar.
        rolesObrigatorios: ['caller', 'offtank', 'mainhealer', 'shadowcaller', 'greatarcane'],
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
                { name: 'Transporte', value: 'Transporte' },
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

// Novo comando: ranking semanal de criadores de conteúdo e top participantes.
const rankingCommand = new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Ver quem mais criou conteúdo e o top 10 de participantes')
    .addStringOption(option =>
        option.setName('periodo')
            .setDescription('Período do ranking')
            .setRequired(false)
            .addChoices(
                { name: 'Semana atual', value: 'semana' },
                { name: 'Geral (todas as semanas)', value: 'geral' }
            ));

// Novo comando: /aviso — manda uma mensagem por DM a todos os membros
// de um cargo (e, para quem tiver as DMs fechadas, publica no canal
// indicado a mencionar essas pessoas). Só pode ser usado por quem tiver
// um dos cargos listados em AVISO_ALLOWED_ROLE_IDS (.env).
const avisoCommand = new SlashCommandBuilder()
    .setName('aviso')
    .setDescription('Enviar um aviso por DM aos membros de um cargo')
    .addRoleOption(option =>
        option.setName('cargo')
            .setDescription('Cargo a avisar')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('mensagem')
            .setDescription('Mensagem a enviar')
            .setRequired(true))
    .addChannelOption(option =>
        option.setName('canal')
            .setDescription('Canal para avisar quem não recebeu DM (por defeito: este canal)')
            .setRequired(false));

// Novo comando: /loot — divide um valor de loot igualmente pelo número
// de participantes indicado, com opção de descontar taxa da guild (%).
const lootCommand = new SlashCommandBuilder()
    .setName('loot')
    .setDescription('Dividir loot por um número de participantes')
    .addIntegerOption(option =>
        option.setName('valor')
            .setDescription('Valor total do loot (prata)')
            .setRequired(true)
            .setMinValue(1))
    .addIntegerOption(option =>
        option.setName('participantes')
            .setDescription('Número de participantes no evento')
            .setRequired(true)
            .setMinValue(1))
    .addNumberOption(option =>
        option.setName('taxa')
            .setDescription('Taxa da guild a descontar antes de dividir, em % (opcional)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100));

// Novo comando: /conta — calculadora genérica para contas rápidas que não
// são só "dividir por participantes" (ex: preço de um item menos o valor
// já recebido em loot, somar vários valores, aplicar uma taxa, etc.).
// Aceita uma expressão matemática simples: + - * / ( ) e casas decimais.
const contaCommand = new SlashCommandBuilder()
    .setName('conta')
    .setDescription('Fazer uma conta rápida (ex: 2500000 - 1800000 * 0.9)')
    .addStringOption(option =>
        option.setName('expressao')
            .setDescription('Expressão a calcular. Ex: 2500000 - 1800000, ou (500000+300000)/4')
            .setRequired(true));

// IDs dos cargos que podem usar /aviso (ex: @moderador, @admin).
// Define no .env: AVISO_ALLOWED_ROLE_IDS=123456789012345678,987654321098765432
const AVISO_ALLOWED_ROLE_IDS = (process.env.AVISO_ALLOWED_ROLE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

function podeUsarAviso(member) {
    if (AVISO_ALLOWED_ROLE_IDS.length === 0) return false;
    return member.roles.cache.some(role => AVISO_ALLOWED_ROLE_IDS.includes(role.id));
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [command.toJSON(), rankingCommand.toJSON(), avisoCommand.toJSON(), lootCommand.toJSON(), contaCommand.toJSON()] }
        );

        console.log('Slash commands registados.');
    } catch (error) {
        console.error(error);
    }
})();

client.once(Events.ClientReady, () => {
    console.log(`Bot online: ${client.user.tag}`);
    agendarRankingSemanal();
});

// Guarda a data (YYYY-MM-DD, em Lisboa) do último envio automático, para
// garantir que o ranking só é enviado uma vez em cada sábado às 14:00,
// mesmo que o setInterval corra várias vezes dentro desse minuto.
let ultimoEnvioRanking = null;

// Devolve as partes da hora atual (dia da semana, hora, minuto, data) já
// convertidas para o fuso horário de Lisboa, sem depender de bibliotecas
// externas — usa apenas o Intl embutido no Node.
function obterHoraLisboa() {
    const agora = new Date();

    const partes = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(agora);

    const obter = tipo => partes.find(p => p.type === tipo)?.value;

    return {
        diaSemana: obter('weekday'), // 'Sat', 'Sun', etc.
        hora: Number(obter('hour')),
        minuto: Number(obter('minute')),
        dataISO: `${obter('year')}-${obter('month')}-${obter('day')}`
    };
}

// Verifica a cada minuto se já é sábado às 14:00 em Lisboa e, nesse caso,
// envia o ranking da semana para o canal configurado.
function agendarRankingSemanal() {
    if (!RANKING_CHANNEL_ID) {
        console.warn('RANKING_CHANNEL_ID não definido no .env — o ranking semanal automático está desativado.');
        return;
    }

    setInterval(async () => {
        const { diaSemana, hora, minuto, dataISO } = obterHoraLisboa();

        const eSabadoAs14h = diaSemana === 'Sat' && hora === 14 && minuto === 0;

        if (!eSabadoAs14h || ultimoEnvioRanking === dataISO) return;

        ultimoEnvioRanking = dataISO;

        try {
            const canal = await client.channels.fetch(RANKING_CHANNEL_ID);
            if (!canal) {
                console.error('Não foi possível encontrar o canal com RANKING_CHANNEL_ID.');
                return;
            }
            await canal.send({ embeds: [criarEmbedRanking('semana')] });
            console.log('Ranking semanal enviado automaticamente.');
        } catch (err) {
            console.error('Erro ao enviar o ranking semanal automático:', err);
        }
    }, 30 * 1000); // verifica a cada 30 segundos

    console.log('Agendamento do ranking semanal ativo (sábados às 14:00, Europe/Lisbon).');
}

function totalParticipantes(evento) {
    return evento.roles.reduce((total, role) => total + role.members.length, 0);
}

function classesObrigatoriasCompletas(evento) {
    if (!evento.rolesObrigatorios) return true;
    return evento.rolesObrigatorios.every(id => {
        const role = evento.roles.find(r => r.id === id);
        return role && role.members.length >= role.max;
    });
}

function criarEmbed(evento) {
    const secoes = evento.roles
        .map(role => `${role.emoji} ${role.label} (${role.members.length}/${role.max})\n${role.members.map(m => m.nome).join('\n') || 'Nenhum'}`)
        .join('\n\n');

    const rodape = evento.globalCap
        ? `\n\n👥 Total: ${totalParticipantes(evento)}/${evento.globalCap}`
        : '';

    const avisoClassesFixas = evento.rolesObrigatorios
        ? (classesObrigatoriasCompletas(evento)
            ? '\n\n✅ Classes fixas completas — a dungeon segue!'
            : '\n\n⚠️ Sem as 5 classes fixas completas, a dungeon não segue.')
        : '';

    return new EmbedBuilder()
        .setTitle(`⚔ ${evento.tipo}`)
        .setDescription(
`📍 Saída: ${evento.saida}
📅 Data: ${evento.data}
⏰ Hora: ${evento.hora}
🎯 Tier obrigatório: ${evento.tier}
🙋 Criado por: ${evento.criadorNome}

${secoes}${rodape}${avisoClassesFixas}`
        )
        .setColor(evento.rolesObrigatorios && !classesObrigatoriasCompletas(evento) ? 'Yellow' : 'Green');
}

function criarBotoes(evento) {
    const botoesRoles = evento.roles.map(role =>
        new ButtonBuilder()
            .setCustomId(role.id)
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

// Formata números de prata com separador de milhares (ex: 1234567 -> "1.234.567").
function formatarPrata(valor) {
    return Math.round(valor).toLocaleString('pt-PT');
}

// Constrói o embed com a divisão do loot.
function criarEmbedLoot({ valor, participantes, taxa, autorNome }) {
    const temTaxa = taxa > 0;
    const valorLiquido = temTaxa ? valor * (1 - taxa / 100) : valor;
    const porPessoa = valorLiquido / participantes;

    const descricaoTaxa = temTaxa
        ? `💸 Taxa da guild: ${taxa}% (−${formatarPrata(valor - valorLiquido)})\n📦 Loot líquido: ${formatarPrata(valorLiquido)}\n`
        : '';

    return new EmbedBuilder()
        .setTitle('💰 Divisão de Loot')
        .setDescription(
`📦 Loot total: ${formatarPrata(valor)}
${descricaoTaxa}👥 Participantes: ${participantes}

✅ Cada um recebe: **${formatarPrata(porPessoa)}**`
        )
        .setFooter({ text: `Calculado por ${autorNome}` })
        .setColor('Gold');
}

// Avalia uma expressão matemática simples de forma segura: só permite
// dígitos, . , espaços, parênteses e os operadores + - * /. Qualquer outro
// carácter (letras, ; , etc.) é rejeitado antes de sequer se tentar calcular,
// para impedir que se corra código arbitrário através do comando.
function avaliarExpressao(expressao) {
    const limpa = expressao.trim();

    if (!/^[0-9+\-*/().\s]+$/.test(limpa)) {
        throw new Error('Expressão inválida. Usa só números e + - * / ( ).');
    }

    // Bloqueia sequências de operadores esquisitas tipo "**" ou "//" que
    // o regex acima deixaria passar mas não fazem sentido aqui.
    if (/[*/+\-]{2,}/.test(limpa.replace(/\s+/g, ''))) {
        throw new Error('Expressão inválida.');
    }

    let resultado;
    try {
        // Function(...) em vez de eval direto, mas só chega aqui depois de
        // validado acima que só há números/operadores — nada de código.
        resultado = Function(`"use strict"; return (${limpa});`)();
    } catch (err) {
        throw new Error('Não consegui calcular essa expressão.');
    }

    if (typeof resultado !== 'number' || !Number.isFinite(resultado)) {
        throw new Error('Essa expressão não dá um resultado válido.');
    }

    return resultado;
}

// Constrói o embed com o resultado do /conta.
function criarEmbedConta({ expressao, resultado, autorNome }) {
    return new EmbedBuilder()
        .setTitle('🧮 Conta')
        .setDescription(
`📝 Expressão: \`${expressao}\`

✅ Resultado: **${formatarPrata(resultado)}**`
        )
        .setFooter({ text: `Calculado por ${autorNome}` })
        .setColor('Gold');
}

// Constrói o embed de ranking (criadores + participantes) para um período.
function criarEmbedRanking(periodo) {
    const semanaAtual = getSemanaISO(new Date());

    let eventosFiltrados = stats.eventos;
    let participacoesFiltradas = stats.participacoes;
    let tituloPeriodo = 'Geral (todas as semanas)';

    if (periodo === 'semana') {
        eventosFiltrados = stats.eventos.filter(e => e.semana === semanaAtual);
        participacoesFiltradas = stats.participacoes.filter(p => p.semana === semanaAtual);
        tituloPeriodo = `Semana atual (${semanaAtual})`;
    }

    // Agrupa por ID (não por nome) para que uma mudança de nickname não
    // fragmente as contagens de uma mesma pessoa em duas entradas, nem
    // duas pessoas com o mesmo nickname fiquem juntas na mesma entrada.
    const contagemCriadores = {};
    eventosFiltrados.forEach(e => {
        if (!contagemCriadores[e.criadorId]) {
            contagemCriadores[e.criadorId] = { nome: e.criadorNome, count: 0 };
        }
        contagemCriadores[e.criadorId].nome = e.criadorNome; // usa o nome mais recente
        contagemCriadores[e.criadorId].count++;
    });
    const rankingCriadores = Object.values(contagemCriadores)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(({ nome, count }) => [nome, count]);

    const contagemParticipantes = {};
    participacoesFiltradas.forEach(p => {
        if (!contagemParticipantes[p.userId]) {
            contagemParticipantes[p.userId] = { nome: p.nome, count: 0 };
        }
        contagemParticipantes[p.userId].nome = p.nome; // usa o nome mais recente
        contagemParticipantes[p.userId].count++;
    });
    const rankingParticipantes = Object.values(contagemParticipantes)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(({ nome, count }) => [nome, count]);

    const medalhas = ['🥇', '🥈', '🥉'];
    const formatarLista = (lista, unidade) => {
        if (lista.length === 0) return 'Sem dados ainda.';
        return lista
            .map(([nome, count], i) => {
                const posicao = medalhas[i] || `**${i + 1}.**`;
                const rotulo = count === 1 ? unidade.singular : unidade.plural;
                return `${posicao} ${nome} — ${count} ${rotulo}`;
            })
            .join('\n');
    };

    return new EmbedBuilder()
        .setTitle(`📊 Ranking — ${tituloPeriodo}`)
        .addFields(
            {
                name: '🎯 Quem mais puxou conteúdo (criadores)',
                value: formatarLista(rankingCriadores, { singular: 'evento criado', plural: 'eventos criados' })
            },
            {
                name: '🏆 Top 10 Participantes',
                value: formatarLista(rankingParticipantes, { singular: 'participação', plural: 'participações' })
            }
        )
        .setColor('Blue');
}

client.on(Events.InteractionCreate, async interaction => {

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'ranking') {
            const periodo = interaction.options.getString('periodo') || 'semana';
            await interaction.reply({ embeds: [criarEmbedRanking(periodo)] });
            return;
        }

        if (interaction.commandName === 'loot') {
            const valor = interaction.options.getInteger('valor');
            const participantes = interaction.options.getInteger('participantes');
            const taxa = interaction.options.getNumber('taxa') || 0;
            const autorNome = interaction.member.displayName || interaction.user.username;

            await interaction.reply({
                embeds: [criarEmbedLoot({ valor, participantes, taxa, autorNome })]
            });
            return;
        }

        if (interaction.commandName === 'conta') {
            const expressao = interaction.options.getString('expressao');
            const autorNome = interaction.member.displayName || interaction.user.username;

            try {
                const resultado = avaliarExpressao(expressao);
                await interaction.reply({
                    embeds: [criarEmbedConta({ expressao, resultado, autorNome })]
                });
            } catch (err) {
                await interaction.reply({
                    content: `❌ ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        if (interaction.commandName === 'aviso') {
            if (!podeUsarAviso(interaction.member)) {
                await interaction.reply({
                    content: 'Não tens permissão para usar este comando.',
                    ephemeral: true
                });
                return;
            }

            const cargo = interaction.options.getRole('cargo');
            const mensagem = interaction.options.getString('mensagem');
            const canalFallback = interaction.options.getChannel('canal') || interaction.channel;

            await interaction.deferReply({ ephemeral: true });

            // Garante que a cache de membros do cargo está completa antes
            // de ler cargo.members (precisa do intent GuildMembers).
            await interaction.guild.members.fetch();

            const membros = cargo.members.filter(m => !m.user.bot);

            if (membros.size === 0) {
                await interaction.editReply('Esse cargo não tem membros (além de bots).');
                return;
            }

            let enviados = 0;
            const falharam = [];

            for (const membro of membros.values()) {
                try {
                    await membro.send(`📢 **Aviso de ${interaction.guild.name}:**\n${mensagem}`);
                    enviados++;
                } catch (err) {
                    falharam.push(membro);
                }
                // Pequena pausa entre DMs para não sobrecarregar a API.
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (falharam.length > 0) {
                const mencoes = falharam.map(m => `<@${m.id}>`).join(' ');
                await canalFallback.send(
                    `📢 **Aviso para ${cargo}:**\n${mensagem}\n\n(Não foi possível enviar DM a: ${mencoes})`
                );
            }

            await interaction.editReply(
                `Aviso enviado a ${cargo.name}.\n` +
                `✅ DM entregue a ${enviados} pessoa(s).` +
                (falharam.length > 0
                    ? `\n⚠️ ${falharam.length} sem DM aberta — avisadas em ${canalFallback}.`
                    : '')
            );
            return;
        }

        if (interaction.commandName !== 'conteudo') return;

        const tipo = interaction.options.getString('tipo');
        const roleSet = ROLE_SETS[tipo];

        let roles;
        let globalCap;
        let rolesObrigatorios;

        if (roleSet) {
            // Tipo com vagas fixas (ex: Dg Avaloniana)
            roles = roleSet.roles.map(r => ({ ...r, members: [] }));
            globalCap = roleSet.globalCap;
            rolesObrigatorios = roleSet.rolesObrigatorios;
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
            rolesObrigatorios = undefined;
        }

        const criadorNome = interaction.member.displayName || interaction.user.username;

        const evento = {
            tipo,
            saida: interaction.options.getString('saida'),
            data: interaction.options.getString('data'),
            hora: interaction.options.getString('hora'),
            tier: interaction.options.getString('tier'),
            roles,
            globalCap,
            rolesObrigatorios,
            criadorId: interaction.user.id,
            criadorNome,
            // Guarda os IDs de quem já foi contabilizado para o ranking
            // neste evento — mesmo que a pessoa saia e volte a entrar,
            // não volta a contar (evita inflacionar o próprio número).
            contabilizados: new Set()
        };

        const msg = await interaction.reply({
            embeds: [criarEmbed(evento)],
            components: criarBotoes(evento),
            fetchReply: true
        });

        eventos.set(msg.id, evento);
        saveEventos();

        // Regista para efeitos de ranking semanal de criadores.
        registarEventoCriado(interaction.user.id, criadorNome, tipo);
    }

    if (interaction.isButton()) {

        const evento = eventos.get(interaction.message.id);

        if (!evento) return;

        const nome = interaction.member.displayName || interaction.user.username;
        const jaInscritoEm = evento.roles.find(role => role.members.some(m => m.id === interaction.user.id));

        if (interaction.customId !== 'sair') {
            const role = evento.roles.find(r => r.id === interaction.customId);

            if (role && !(jaInscritoEm && jaInscritoEm.id === role.id)) {
                // Se o utilizador mudar de vaga, o total global não sobe,
                // por isso não conta a vaga antiga ao verificar o limite.
                const totalAtual = totalParticipantes(evento) - (jaInscritoEm ? 1 : 0);
                const abaixoDoLimiteGlobal = !evento.globalCap || totalAtual < evento.globalCap;

                if (role.members.length < role.max && abaixoDoLimiteGlobal) {
                    // "Novo participante" para efeitos de ranking = ainda não
                    // foi contabilizado NESTE evento, mesmo que já tenha saído
                    // e voltado a entrar (evita inflacionar o próprio número
                    // a sair e a entrar repetidamente).
                    const eraNovoParticipante = !evento.contabilizados.has(interaction.user.id);

                    if (jaInscritoEm) {
                        jaInscritoEm.members = jaInscritoEm.members.filter(m => m.id !== interaction.user.id);
                    }
                    role.members.push({ id: interaction.user.id, nome });

                    if (eraNovoParticipante) {
                        evento.contabilizados.add(interaction.user.id);
                        registarParticipacao(interaction.user.id, nome);
                    }
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
            jaInscritoEm.members = jaInscritoEm.members.filter(m => m.id !== interaction.user.id);
        }

        saveEventos();

        await interaction.update({
            embeds: [criarEmbed(evento)]
        });
    }
});

client.login(process.env.TOKEN);
