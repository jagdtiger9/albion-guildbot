"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Faction_1 = require("./Faction");
/**
 * An {@link Guild} is an immutable object that abstracts relevant details about
 *   a group of {@link Player}s present in the same AO {@link Battle} from raw
 *   battle data received from the AO API.
 */
class Guild {
    constructor(guildData, battleData) {
        this.factionType = Faction_1.FactionType.Guild;
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
//# sourceMappingURL=Guild.js.map