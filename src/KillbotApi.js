const INFO_URL = 'https://www.albiononline2d.com/en/scoreboard';
const { createImage } = require('./createImage');

const FileSync = require('lowdb/adapters/FileSync');
const low = require('lowdb');
const adapter = new FileSync('./database/.db.json');
const db = low(adapter);

const Battle = require('./Battle/index');
const AlbionApi = require('./AlbionApi');

module.exports = class KillBot {
    constructor(config, bot, sqlite3) {
        this.config = config;

        db.defaults({ recents: { battleId: 0, eventId: 0 } }).write();
        this.db = db;
        this.lastBattleId = db.get('recents.battleId').value();
        this.lastEventId = db.get('recents.eventId').value();

        this.bot = bot;
        this.sqlite3 = sqlite3;

        this.albionApi = new AlbionApi();
    }

    checkKillsInterval(timeout) {
        setInterval(() => this.checkKills(), timeout);
    }

    checkBattlesInterval(timeout) {
        setInterval(() => this.checkBattles(), timeout);
    }

    /**
     * Запрашиваем список событий, пачками по 51
     * Если ID первого события в списке больше последнего запомненного, запрашиваем следующую пачку
     *
     * @param startPos  смещение пачки, первый запрос - 0
     * @param minEventId    ID последнего обработанного события из последней транзакции
     * @param maxEventId    ID первого обработанного события пачки,  ID событий следующих пачек должны быть меньше
     */
    checkKills(startPos, minEventId, maxEventId) {
        // Максимальное кол-во подзапросов
        startPos = startPos || 0;
        if (startPos > 5) {
            return;
        }

        minEventId = minEventId || this.lastEventId;
        maxEventId = maxEventId || 0;
        console.log(`Checking killboard... - ${startPos}`);
        this.albionApi.getEvents({ limit: 51, offset: startPos * 51 }).then(
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
                            this.lastEventId = event.EventId;
                        }

                        const isFriendlyKill = this.config.guild.guilds.indexOf(event.Killer.GuildName) !== -1;
                        const isFriendlyDeath = this.config.guild.guilds.indexOf(event.Victim.GuildName) !== -1;

                        if (!(isFriendlyKill || isFriendlyDeath) || event.TotalVictimKillFame < 10000) {
                            return;
                        }

                        console.log(startPos + ' - ' + minEventId + ' -- ' + event.EventId);
                        this.sendKillReport(event);
                    });

                if (startPos === 0) {
                    this.db.set('recents.eventId', this.lastEventId).write();
                }

                if (firstId > minEventId) {
                    console.log('LastSaved: ' + minEventId);
                    console.log('FrstEvent: ' + firstId);
                    console.log('LastEvent: ' + lastId);
                    console.log('GO Next');

                    return this.checkKills(++startPos, minEventId, firstId);
                }
            },
            error => {
                console.log(error);
            }
        ).catch(error => {
            console.log(error);
        });
    }

    sendKillReport(event, channelId) {
        const isFriendlyKill = this.config.guild.guilds.indexOf(event.Killer.GuildName) !== -1;

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

                if (event.TotalVictimKillFame > this.config.kill.minFame) {
                    Object.assign(embed, {
                        title: `${event.Killer.Name} just killed ${event.Victim.Name}!`,
                        description: `Fame: **${event.TotalVictimKillFame.toLocaleString()}** ${assists ? '' : ' Solo kill'}`,
                        fields: [],
                        timestamp: event.TimeStamp,
                    });

                    let assistant = event.Participants.reduce(
                        function(accumulator, item) {
                            let record = item.DamageDone ? item.DamageDone : item.SupportHealingDone;
                            record = Math.round(record).toLocaleString() + ` - [${item.Name}](${INFO_URL}/players/${item.Id})`;
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

                return this.bot.channels.cache.get((channelId || this.config.discord.feedChannelId)).send({ embed, files });
            })
            .then(() => {
                console.log(`Successfully posted log of ${this.createDisplayName(event.Killer)} killing ${this.createDisplayName(event.Victim)}.`);
            })
            .catch(statusError => {
                console.log(statusError);
            });
    }

    createDisplayName(player) {
        const allianceTag = player.AllianceName ? `[${player.AllianceName}]` : '';
        return `**<${allianceTag}${player.GuildName || 'Unguilded'}>** ${player.Name}`;
    }

    checkBattles() {
        console.log('Checking battles...');
        this.albionApi.getBattles({ limit: 20, offset: 0 }).then(battles => {
            battles
                // Filter out battles that have already been processed
                .filter(battleData => battleData.id > this.lastBattleId)
                // Format the raw battle data into a more useful Battle object
                .map(battleData => new Battle(battleData))
                // Filter out battles with insigificant amounts of players
                .filter(battle => battle.players.length >= this.config.battle.minPlayers)
                // Filter out battles that don't involve a relevent number of guildmates
                .filter(battle => {
                    const relevantPlayerCount = this.config.guild.guilds.reduce((total, guildName) => {
                        return total + (battle.guilds.has(guildName)
                            ? battle.guilds.get(guildName).players.length
                            : 0);
                    }, 0);

                    return relevantPlayerCount >= this.config.battle.minRelevantPlayers;
                }).forEach(battle => this.sendBattleReport(battle));
        }).catch(error => {
            console.log(error);
        });
    }

    sendBattleReport(battle, channelId) {
        if (battle.id > this.lastBattleId) {
            this.lastBattleId = battle.id;
            this.db.set('recents.battleId', this.lastBattleId).write();
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

        const didWin = battle.rankedFactions[0].name === this.config.guild.alliance;

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

        this.bot.channels.cache.get(channelId || this.config.discord.feedChannelId).send({ embed }).then(() => {
            console.log(`Successfully posted log of battle between ${title}.`);
        }).catch(err => {
            console.log(err);
        });
    }

    initDatabase() {
        let sqlTables = [
            'CREATE TABLE IF NOT EXISTS lastId (\n' +
            '   battleId INTEGER,\n' +
            '   eventId INTEGER\n' +
            ');',
            'CREATE TABLE IF NOT EXISTS eventIds (\n' +
            '   eventId INTEGER UNIQUE \n' +
            ');',
        ];

        let db = this.connect();
        sqlTables.map(sql => db.run(sql));
        this.disconnect(db);
    }

    connect() {
        return new this.sqlite3.Database('./database/killbot.db', (err) => {
            if (err) {
                console.error(err.message);
                throw new Error(err.message);
            }
            console.log('Killbot database connection - OK');
        });
    }

    disconnect(db) {
        db.close((err) => {
            if (err) {
                return console.error(err.message);
            }
            console.log('Killbot database connection closed');
        });
    }
};
