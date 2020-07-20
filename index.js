'use strict';

const config = require('./config');
const Discord = require('discord.js');
const KillBotApi = require('./src/KillbotApi');

const bot = new Discord.Client();
const KillBot = new KillBotApi(config, bot);

bot.on('ready', () => {
    console.log('Connected');
    console.log(`Logged in as: ${bot.user.username} - (${bot.user.id})`);

    KillBot.checkKills();
    KillBot.checkBattles();

    KillBot.checkKillsInterval(30000);
    KillBot.checkBattlesInterval(30000);

    //setInterval(KillBot.checkKills, 30000);
    //setInterval(checkBattles, 30000);
});

bot.login(config.discord.token);
