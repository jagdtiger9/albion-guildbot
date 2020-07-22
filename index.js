'use strict';

const config = require('./config');
const Discord = require('discord.js');
const KillBotApi = require('./src/KillbotApi');
const sqlite3 = require('sqlite3').verbose();

const bot = new Discord.Client();
const KillBot = new KillBotApi(config, bot, sqlite3);

bot.on('ready', () => {
    console.log('Connected');
    console.log(`Logged in as: ${bot.user.username} - (${bot.user.id})`);

    KillBot.initDatabase();

    KillBot.checkKills();
    KillBot.checkKillsInterval(30000);

    KillBot.checkBattles();
    KillBot.checkBattlesInterval(30000);
});

bot.login(config.discord.token);
