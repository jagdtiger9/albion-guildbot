"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The type of grouping a {@link Faction} represents.
 */
var FactionType;
(function (FactionType) {
    FactionType["Alliance"] = "alliance";
    FactionType["Guild"] = "guild";
    FactionType["Unguilded"] = "unguilded";
})(FactionType = exports.FactionType || (exports.FactionType = {}));
/**
 * A {@link Faction} is an immutable object that represents the faction a
 *   player or group of players belongs to. A faction can represent an
 *   {@link Alliance}, {@link Guild} or 'Unguilded'; whichever is the
 *   highest level of organization the player belongs to. This is primarily
 *   used for being able to associate all players with a group.
 */
class Faction {
    /**
     * Construct a {@link Faction} by extracting and grouping all of the
     *   unguilded players in the passed {@link IBattleData}.
     */
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
//# sourceMappingURL=Faction.js.map