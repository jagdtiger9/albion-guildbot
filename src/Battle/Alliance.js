"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Faction_1 = require("./Faction");
/**
 * An {@link Alliance} is an immutable object that abstracts relevant details about
 *   a group of {@link Player}s present in the same AO {@link Battle} from raw
 *   battle data received from the AO API.
 */
class Alliance {
    constructor(allianceData, battleData) {
        this.factionType = Faction_1.FactionType.Alliance;
        this.deaths = allianceData.deaths;
        this.killFame = allianceData.killFame;
        this.kills = allianceData.kills;
        this.name = allianceData.name;
        this.players = Object.values(battleData.players)
            .filter(player => player.allianceName === allianceData.name);
    }
}
exports.default = Alliance;
//# sourceMappingURL=Alliance.js.map