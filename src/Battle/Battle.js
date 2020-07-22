'use strict';

const Alliance = require('./Alliance');
const Faction = require('./Faction');
const Guild = require('./Guild');

module.exports = class Battle {
    constructor(battleData) {
        this.rankedFactions = [];
        this.endTime = battleData.endTime;
        this.id = battleData.id;
        this.totalFame = battleData.totalFame;
        this.totalKills = battleData.totalKills;
        this.players = Object.values(battleData.players);
        // Alliances
        const allianceArray = Object.values(battleData.alliances)
            .map(allianceData => new Alliance.default(allianceData, battleData));
        this.alliances = new Map(allianceArray
            .map(alliance => [alliance.name, alliance]));
        // Guilds
        const guildArray = Object.values(battleData.guilds)
            .map(guildData => new Guild.default(guildData, battleData));
        this.guilds = new Map(guildArray
            .map(guild => [guild.name, guild]));
        // Factions
        this.rankedFactions = this.rankedFactions.concat(allianceArray
            .map(alliance => new Faction.default(alliance)));
        this.rankedFactions = this.rankedFactions.concat(guildArray
            .filter(guild => guild.alliance === '')
            .map(guild => new Faction.default(guild)));
        const unguildedFaction = Faction.default.fromUnguilded(battleData);
        if (unguildedFaction.players.length) {
            this.rankedFactions.push(unguildedFaction);
        }
        this.is5v5 = this.players.length === 10
            && this.rankedFactions.length === 2
            && this.rankedFactions[0].players.length === 5
            && this.rankedFactions[1].players.length === 5;
        this.rankedFactions.sort((a, b) => this.is5v5
            ? b.kills - a.kills
            : b.killFame - a.killFame);
    }
};
