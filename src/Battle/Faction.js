'use strict';

var FactionType;
(function(FactionType) {
    FactionType['Alliance'] = 'alliance';
    FactionType['Guild'] = 'guild';
    FactionType['Unguilded'] = 'unguilded';
})(FactionType = exports.FactionType || (exports.FactionType = {}));

class Faction {
    static fromUnguilded(battleData) {
        const players = Object.values(battleData.players)
            .filter(player => player.guildName === '');
        const factionData = players.reduce((data, player) => {
            data.deaths += player.deaths;
            data.killFame += player.killFame;
            data.kills += player.kills;
            return data;
        }, {
            deaths: 0,
            factionType: FactionType.Unguilded,
            killFame: 0,
            kills: 0,
            name: 'Unguilded',
            players,
        });
        return new Faction(factionData);
    }

    constructor(factionLike) {
        this.deaths = factionLike.deaths;
        this.factionType = factionLike.factionType;
        this.killFame = factionLike.killFame;
        this.kills = factionLike.kills;
        this.name = factionLike.name;
        this.players = factionLike.players;
    }
}

exports.default = Faction;
