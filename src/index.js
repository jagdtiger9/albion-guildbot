'use strict';

require('babel-polyfill');

const Discord = require('discord.js');
const FileSync = require('lowdb/adapters/FileSync');
const logger = require('winston');
const low = require('lowdb');

const Albion = require('./AlbionApi');
const Battle = require('./Battle').default;
const { createImage, getItemUrl } = require('./createImage');

const config = require('../config');

const adapter = new FileSync('.db.json');
const db = low(adapter);
db.defaults({ recents: { battleId: 0, eventId: 0 } }).write();

// Heroku will crash if we're not listenining on env.PORT.
if (process.env.HEROKU) {
    const Express = require('express');
    const app = new Express();
    app.listen(process.env.PORT || 1337);
}

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, { colorize: true });
logger.level = 'debug';

// Read eventID file to get a list of all posted events
// If this fails, we cannot continue, so throw an exception.
let lastBattleId = db.get('recents.battleId').value();
let lastEventId = db.get('recents.eventId').value();
let lastAlbionStatus = db.get('recents.albionStatus').value();
let lastAlbionStatusMsg = db.get('recents.albionStatusMsg').value();
let lastAlbionStatusTrial = db.get('recents.albionStatusTrial').value();
lastAlbionStatusTrial = lastAlbionStatusTrial !== null ? lastAlbionStatusTrial : 1;

const statusTrialCount = 3;

const infoUrl = 'https://www.albiononline2d.com/en/scoreboard';

// Initialize Discord Bot
const bot = new Discord.Client();

bot.on('ready', () => {
    logger.info('Connected');
    logger.info(`Logged in as: ${bot.user.username} - (${bot.user.id})`);

    if (config.discord.statusChannelId) {
        checkServerStatus();
        setInterval(checkServerStatus, 30000);
    }

    checkBattles();
    checkKillboard();

    setInterval(checkBattles, 30000);
    setInterval(checkKillboard, 30000);
});

function checkBattles() {
    logger.info('Checking battles...');
    Albion.getBattles({ limit: 20, offset: 0 }).then(battles => {
        battles
            // Filter out battles that have already been processed
            .filter(battleData => battleData.id > lastBattleId)
            // Format the raw battle data into a more useful Battle object
            .map(battleData => new Battle(battleData))
            // Filter out battles with insigificant amounts of players
            .filter(battle => battle.players.length >= config.battle.minPlayers)
            // Filter out battles that don't involve a relevent number of guildmates
            .filter(battle => {
                const relevantPlayerCount = config.guild.guilds.reduce((total, guildName) => {
                    return total + (battle.guilds.has(guildName)
                        ? battle.guilds.get(guildName).players.length
                        : 0);
                }, 0);

                return relevantPlayerCount >= config.battle.minRelevantPlayers;
            }).forEach(battle => sendBattleReport(battle));
    }).catch(currentAlbionStatusError => {
        logger.info(currentAlbionStatusError);
    });
}

function sendBattleReport(battle, channelId) {
    if (battle.id > lastBattleId) {
        lastBattleId = battle.id;
        db.set('recents.battleId', lastBattleId).write();
    }

    const title = battle.rankedFactions.slice()
        .sort((a, b) => b.players.length - a.players.length)
        .map(({ name, players }) => `${name}(${players.length})`)
        .join(' vs ');

    const thumbnailUrl = battle.players.length >= 100 ? 'https://storage.googleapis.com/albion-images/static/PvP-100.png'
        : battle.players.length >= 40 ? 'https://storage.googleapis.com/albion-images/static/PvP-40.png'
            : battle.is5v5 ? 'https://storage.googleapis.com/albion-images/static/5v5-3.png'
                : 'https://storage.googleapis.com/albion-images/static/PvP-10.png';

    let fields = battle.rankedFactions.map(({ name, kills, deaths, killFame, factionType }, i) => {
        return {
            name: `${i + 1}. ${name} - ${killFame.toLocaleString()} Fame`,
            inline: true,
            value: [
                `Kills: ${kills}`,
                `Deaths: ${deaths}`,
                factionType === 'alliance' ? '\n__**Guilds**__' : '',
                Array.from(battle.guilds.values())
                    .filter(({ alliance }) => alliance === name)
                    .sort((a, b) => battle.guilds.get(b.name).players.length > battle.guilds.get(a.name).players.length)
                    .map(({ name }) => `${name} (${battle.guilds.get(name).players.length})`)
                    .join('\n'),
            ].join('\n')
        };
    });

    if (battle.is5v5) {
        fields = battle.rankedFactions.map(({ name, kills, players }) => {
            return {
                name: `${name} [Kills: ${kills}]`,
                inline: true,
                value: players
                    .sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1)
                    .sort((a, b) => b.kills > a.kills)
                    .map(({ name, kills, deaths }) => `${deaths ? '~~' : ''}${name}${deaths ? '~~' : ''}: ${kills} Kills`)
                    .join('\n')
            };
        });
    }

    const didWin = battle.rankedFactions[0].name === config.guild.alliance;

    const embed = {
        url: `https://albiononline.com/en/killboard/battles/${battle.id}`,
        description: battle.is5v5
            ? `Winner's Fame: ${battle.rankedFactions[0].killFame.toLocaleString()}`
            : `Players: ${battle.players.length}, Kills: ${battle.totalKills}, Fame: ${battle.totalFame.toLocaleString()}`,
        title: battle.is5v5
            ? (didWin ? `We wrecked ${battle.rankedFactions[1].name} in a 5v5!` : `We lost to ${battle.rankedFactions[0].name} in a 5v5!`)
            : title,
        color: didWin ? 65280 : 16711680,
        timestamp: battle.endTime,
        thumbnail: { url: thumbnailUrl },
        image: { url: 'https://storage.googleapis.com/albion-images/static/spacer.png' },
        fields,
    };

    bot.channels.cache.get(channelId || config.discord.feedChannelId).send({ embed }).then(() => {
        logger.info(`Successfully posted log of battle between ${title}.`);
    }).catch(err => {
        logger.error(err);
    });
}

function sendKillReport(event, channelId) {
    const isFriendlyKill = config.guild.guilds.indexOf(event.Killer.GuildName) !== -1;

    createImage('Victim', event)
        .then(imgBufferVictim => {
            const participants = parseInt(event.numberOfParticipants || event.GroupMembers.length, 10);
            const assists = participants - 1;

            const embed = {
                url: `https://albiononline.com/en/killboard/kill/${event.EventId}`,
                title: '',
                description: '',
                color: isFriendlyKill ? 65280 : 16711680,
                image: { url: 'attachment://kill.png' },
            };

            if (event.TotalVictimKillFame > config.kill.minFame) {
                Object.assign(embed, {
                    title: `${event.Killer.Name} just killed ${event.Victim.Name}!`,
                    description: `Fame: **${event.TotalVictimKillFame.toLocaleString()}** ${assists ? '' : ' Solo kill'}`,
                    fields: [],
                    timestamp: event.TimeStamp,
                });

                let assistant = event.Participants.reduce(
                    function(accumulator, item) {
                        let record = item.DamageDone ? item.DamageDone : item.SupportHealingDone;
                        record = Math.round(record).toLocaleString() + ` - [${item.Name}](${infoUrl}/players/${item.Id})`;
                        //(item.GuildName ? `[${item.GuildName}] ` : '') + `, IP:${Math.round(item.AverageItemPower).toLocaleString()}`;

                        // Ассист по дамагу или убийца получил 0 фейма
                        if (item.DamageDone || event.Killer.Name === item.Name) {
                            accumulator.dd.push(record);
                        } else if (item.SupportHealingDone) {
                            accumulator.heal.push(record);
                        }

                        return accumulator;
                    },
                    { 'dd': [], 'heal': [] }
                );

                if (assistant.dd.length) {
                    embed.fields.push(
                        {
                            name: 'Damage' + (assistant.dd.length > 1 ? ` + ${assistant.dd.length - 1}` : ''),
                            value: assistant.dd.join('\n'),
                            inline: true,
                        }
                    );
                }
                if (assistant.heal.length) {
                    embed.fields.push(
                        {
                            name: 'Heal',
                            value: assistant.heal.join('\n'),
                            inline: true,
                        }
                    );
                }
            }

            const files = [{ name: 'kill.png', attachment: imgBufferVictim }];

            return bot.channels.cache.get((channelId || config.discord.feedChannelId)).send({ embed, files });
        })
        .then(() => {
            logger.info(`Successfully posted log of ${createDisplayName(event.Killer)} killing ${createDisplayName(event.Victim)}.`);
        });
}

function recursiveKillboard(startPos) {
    startPos = startPos || 0;

    if (startPos >= 0) {
        return checkKillboard(startPos).then(_ => recursiveKillboard(files));
    } else {
        return Promise.resolve();
    }
}

const recursiveCall = (index) => {
    return new Promise((resolve) => {
        console.log(index);
        if (index < 3) {
            return resolve(recursiveCall(++index));
        } else {
            return resolve();
        }
    });
};

/**
 * Запрашиваем список событий, пачками по 51
 * Если ID первого события в списке больше последнего запомненного, запрашиваем следующую пачку
 *
 * @param startPos  смещение пачки, первый запрос - 0
 * @param minEventId    ID последнего обработанного события из последней транзакции
 * @param maxEventId    ID первого обработанного события пачки,  ID событий следующих пачек должны быть меньше
 */
function checkKillboard(startPos, minEventId, maxEventId) {
    startPos = startPos || 0;
    if (startPos > 7) {
        // Максимальное кол-во подзапросов - 7
        return;
    }

    minEventId = minEventId || lastEventId;
    maxEventId = maxEventId || 0;
    logger.info(`Checking killboard... - ${startPos}`);
    Albion.getEvents({ limit: 51, offset: startPos * 51 }).then(
        events => {
            if (!events) {
                return resolve();
            }
            events.sort((a, b) => a.EventId - b.EventId);

            let firstId = events[0].EventId;
            let lastId = events[events.length - 1].EventId;

            events.filter(event => event.EventId > minEventId && (maxEventId === 0 || event.EventId < maxEventId))
                .forEach(event => {
                    if (startPos === 0) {
                        lastEventId = event.EventId;
                    }

                    const isFriendlyKill = config.guild.guilds.indexOf(event.Killer.GuildName) !== -1;
                    const isFriendlyDeath = config.guild.guilds.indexOf(event.Victim.GuildName) !== -1;

                    if (!(isFriendlyKill || isFriendlyDeath) || event.TotalVictimKillFame < 10000) {
                        return;
                    }

                    console.log(startPos + ' - ' + minEventId + ' -- ' + event.EventId);
                    sendKillReport(event);
                });

            if (startPos === 0) {
                db.set('recents.eventId', lastEventId).write();
            }

            if (firstId > minEventId) {
                console.log('LastSaved: ' + minEventId);
                console.log('FrstEvent: ' + firstId);
                console.log('LastEvent: ' + lastId);
                console.log('GO Next');

                return checkKillboard(++startPos, minEventId, firstId);
            }
        },
        error => {
            console.log(error);
        }
    ).catch(currentAlbionStatusError => {
        logger.info(currentAlbionStatusError);
    });
}

function createGuildTag(player) {
    const allianceTag = player.AllianceName ? `[${player.AllianceName}]` : '';
    return player.GuildName ? `${allianceTag} [${player.GuildName}](${infoUrl}/guilds/${player.GuildId})` : 'N/A';
}

function createDisplayName(player) {
    const allianceTag = player.AllianceName ? `[${player.AllianceName}]` : '';
    return `**<${allianceTag}${player.GuildName || 'Unguilded'}>** ${player.Name}`;
}

function sendServerStatus(channelId, isCmd) {
    let now = new Date();

    const embed = {
        url: 'https://albiononline.statuspage.io',
        title: 'Albion Status Information',
        description: isCmd
            ? `Current server status is **${lastAlbionStatus}**`
            : `Server status just changed to **${lastAlbionStatus}**`,
        color: lastAlbionStatus === 'offline' ? 0xff2600 : 0x00f900,
        fields: [{
            name: 'Message',
            value: lastAlbionStatusMsg,
            inline: true,
        }],
        timestamp: now.toISOString(),
    };

    bot.channels.cache.get(channelId || config.discord.statusChannelId).send({ embed }).then(() => {
        logger.info(`Successfully posted albion status: ${lastAlbionStatus}`);
    }).catch(err => {
        logger.error(err);
    });
}

function checkServerStatus(channelId) {
    logger.info('Checking server status...');
    // Устанавливаемый статус получает 3 балла
    // Измененный статус скидывает значение на 1балл, до 1
    // Как только значение скинуто до 1, устанавливается новый, измененный статус со сзначением 3балла
    Albion.serverStatusRequest().then(currentAlbionStatus => {
        logger.info(currentAlbionStatus.status);
        if (lastAlbionStatus !== currentAlbionStatus.status || lastAlbionStatusMsg !== currentAlbionStatus.message) {
            if (lastAlbionStatusTrial > 1) {
                lastAlbionStatusTrial--;
                db.set('recents.albionStatusTrial', lastAlbionStatusTrial).write();
            } else {
                lastAlbionStatus = currentAlbionStatus.status;
                lastAlbionStatusMsg = currentAlbionStatus.message;
                lastAlbionStatusTrial = statusTrialCount;
                db.set('recents.albionStatus', currentAlbionStatus.status).write();
                db.set('recents.albionStatusMsg', currentAlbionStatus.message).write();
                db.set('recents.albionStatusTrial', lastAlbionStatusTrial).write();
                sendServerStatus(channelId);
            }
        } else if (lastAlbionStatusTrial < statusTrialCount) {
            lastAlbionStatusTrial++;
            db.set('recents.albionStatusTrial', lastAlbionStatusTrial).write();
        }
    }).catch(currentAlbionStatusError => {
        logger.info(currentAlbionStatusError);
    });
}

bot.on('message', msg => {
    let message = msg.content;
    let channelID = msg.channel.id;

    let matches = message.match(/^https:\/\/albiononline\.com\/en\/killboard\/kill\/(\d+)/);
    if (matches && matches.length) {
        Albion.getEvent(matches[1]).then(event => {
            sendKillReport(event, channelID);
        });
        return;
    }

    matches = message.match(/^https:\/\/albiononline\.com\/en\/killboard\/battles\/(\d+)/);
    if (matches && matches.length) {
        Albion.getBattle(matches[1]).then(battle => {
            sendBattleReport(new Battle(battle), channelID);
        });
        return;
    }

    if (message.substring(0, 1) !== '!') {
        return;
    }

    const args = message.substring(1).split(' ');
    const [cmd, id] = args;

    if (!cmd) {
        return;
    }

    // cmd without parameter
    switch (cmd) {
        case 'showStatus':
            sendServerStatus(channelID, 1);
            break;
    }

    if (!id) {
        return;
    }

    // cmd with parameter
    switch (cmd) {
        case 'showBattle':
            Albion.getBattle(id).then(battle => {
                sendBattleReport(new Battle(battle), channelID);
            });
            break;
        case 'showKill':
            Albion.getEvent(id).then(event => {
                sendKillReport(event, channelID);
            });
            break;
    }
});

bot.login(config.discord.token);
