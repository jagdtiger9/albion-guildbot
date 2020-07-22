'use strict';

const Faction = require('./Faction');

class Guild {
    constructor(guildData, battleData) {
        this.factionType = Faction.FactionType.Guild;
        this.alliance = guildData.alliance;
        this.deaths = guildData.deaths;
        this.killFame = guildData.killFame;
        this.kills = guildData.kills;
        this.name = guildData.name;
        this.players = Object.values(battleData.players)
            .filter(player => player.guildName === guildData.name);
    }
}

exports.default = Guild;
