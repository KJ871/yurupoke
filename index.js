import { Client, REST, Routes, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import path from 'path';

const token = '';
const clientId = '1318818467847340043';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const cardDataFolder = './card';
let cardData = {};
const pageCache = new Map();

// カードデータの読み込み
try {
    const files = fs.readdirSync(cardDataFolder);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const filePath = path.join(cardDataFolder, file);
            const data = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(data);
            Object.assign(cardData, jsonData);
        }
    });
    console.log('[✔] カードデータ読み込み完了');
} catch (error) {
    console.error('[❌] カードデータ読み込みエラー:', error);
}

// スラッシュコマンド登録
const commands = [
    {
        name: 'card',
        description: 'カード名で検索します',
        options: [
            {
                type: 3,
                name: 'name',
                description: 'カード名を入力',
                required: true,
                autocomplete: true
            }
        ]
    }
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('[✔] スラッシュコマンド登録完了');
    } catch (err) {
        console.error('[❌] コマンド登録失敗:', err);
    }
}

function getPageButtons(current, total) {
    return [
        {
            type: 1,
            components: [
                {
                    type: 2,
                    label: '⬅️ 前',
                    style: 1,
                    custom_id: 'prev',
                    disabled: current === 0
                },
                {
                    type: 2,
                    label: '➡️ 次',
                    style: 1,
                    custom_id: 'next',
                    disabled: current === total - 1
                }
            ]
        }
    ];
}

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    registerCommands();
    // アクティビティの交互表示を始める
    let toggle = true;

    setInterval(() => {
        const serverCount = client.guilds.cache.size;

        // 画像URLの数をカウント
        const cardCount = Object.values(cardData).reduce((total, card) => {
            return total + card.types.length; // 画像URLの配列の長さを加算
        }, 0);

        if (toggle) {
            client.user.setActivity(`サーバー数: ${serverCount}`, { type: 0 }); // "Playing"
        } else {
            client.user.setActivity(`登録カード数: ${cardCount}`, { type: 0 }); // "Playing"
        }

        // 次の表示を切り替え
        toggle = !toggle;
    }, 5000); // 10秒ごとに切り替え
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        const filtered = Object.keys(cardData)
            .filter(name => name.toLowerCase().includes(focused.toLowerCase()))
            .slice(0, 10);
        await interaction.respond(filtered.map(name => ({ name, value: name })));
        return;
    }

    if (interaction.isCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'card') {
            const query = options.getString('name').toLowerCase();
            const foundKey = Object.keys(cardData).find(key =>
                key.toLowerCase().includes(query)
            );

            if (!foundKey) {
                await interaction.reply(`❌ 「${query}」に一致するカードは見つかりませんでした。`);
                return;
            }

            const card = cardData[foundKey];

            const imageUrls = Object.values(card.types);
            const pages = imageUrls.map(image =>
                new EmbedBuilder()
                    .setTitle(card.name) // カード名のみ表示
                    .setImage(image) // 画像のみ表示
                    .setColor(0x00bfff)
            );

            const currentPage = 0;
            pageCache.set(interaction.id, {
                user: interaction.user.id,
                pages,
                currentPage
            });

            await interaction.reply({
                embeds: [pages[currentPage]],
                components: getPageButtons(currentPage, pages.length),
                ephemeral: false
            });

            setTimeout(() => pageCache.delete(interaction.id), 60000);
        }
    }

    if (interaction.isButton()) {
        const cache = pageCache.get(interaction.message.interaction.id);
        if (!cache || cache.user !== interaction.user.id) {
            await interaction.reply({ content: '⛔ このボタンはあなたの操作ではありません。', ephemeral: true });
            return;
        }

        if (interaction.customId === 'next') cache.currentPage++;
        if (interaction.customId === 'prev') cache.currentPage--;

        const buttons = getPageButtons(cache.currentPage, cache.pages.length);
        await interaction.update({
            embeds: [cache.pages[cache.currentPage]],
            components: buttons
        });
    }
});

client.login(token);
