'use strict';

const Jimp = require('jimp');
const config = require('../config');

const FONT_SIZE = 32;
const ITEM_SIZE = 60;

const fontPromise = Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
const iconsPromise = Jimp.read('https://assets.albiononline.com/assets/images/killboard/fame-list__icons.png').then(image => {
    const skull = image.clone();

    skull.crop(990, 0, 100, 100);
    image.crop(110, 0, 100, 100);

    return { swords: image, skull: skull };
});

function getItemUrl(item) {
    return item && [
        'https://gameinfo.albiononline.com/api/gameinfo/items/',
        `${item.Type}.png`,
        `?count=${item.Count}`,
        `&quality=${item.Quality}`,
    ].join('');
}

function getItemImage(item, size) {
    return Jimp.read(getItemUrl(item)).then(image => {
        image.resize(size, size);
        return image;
    });
}

function fillRectangle(image, hex, x1, y1, x2, y2) {
    let y;
    for (let x = x1; x < x2; x++) {
        for (y = y1; y < y2; y++) {
            image.setPixelColor(hex, x, y);
        }
    }
}

function createImage(target, event) {
    const equipment = [
        event['Killer'].Equipment.MainHand,
        event['Killer'].Equipment.OffHand,
        event['Killer'].Equipment.Armor,
        event['Killer'].Equipment.Shoes,
        event['Killer'].Equipment.Head,
        event['Killer'].Equipment.Mount,
        event[target].Equipment.MainHand,
        event[target].Equipment.OffHand,
        event[target].Equipment.Armor,
        event[target].Equipment.Shoes,
        event[target].Equipment.Head,
        event[target].Equipment.Mount,
    ];

    return Promise.all(equipment.map(item => item
        ? getItemImage(item, ITEM_SIZE)
        : Promise.resolve(new Jimp(ITEM_SIZE, ITEM_SIZE))
    )).then(images => {
        const output = new Jimp(ITEM_SIZE * 6, (ITEM_SIZE + FONT_SIZE) * 2);
        for (let i = 0; i < 6; i++) {
            output.composite(images[i], ITEM_SIZE * i, FONT_SIZE);
        }
        for (let i = 6; i < 12; i++) {
            output.composite(images[i], ITEM_SIZE * (i - 6), FONT_SIZE * 2 + ITEM_SIZE);
        }
        fillRectangle(output, Jimp.rgbaToInt(0, 0, 0, 255), 0, 4, ITEM_SIZE * 6, FONT_SIZE - 4);
        fillRectangle(output, Jimp.rgbaToInt(0, 0, 0, 255), 0, 4 + FONT_SIZE + ITEM_SIZE, ITEM_SIZE * 6, ITEM_SIZE + 2 * FONT_SIZE - 4);

        return fontPromise.then(font => {
            const itemPowerKiller = event.Killer.AverageItemPower;
            const gearScoreKiller = Math.round(itemPowerKiller).toLocaleString();
            const scoreDistanceKiller = itemPowerKiller > 999 ? 52
                : itemPowerKiller > 99 ? 35
                    : itemPowerKiller > 9 ? 27
                        : 19;

            const itemPowerVictim = event.Victim.AverageItemPower;
            const gearScoreVictim = Math.round(itemPowerVictim).toLocaleString();
            const scoreDistanceVictim = itemPowerVictim > 999 ? 52
                : itemPowerVictim > 99 ? 35
                    : itemPowerVictim > 9 ? 27
                        : 19;

            output.print(font, ITEM_SIZE * 6 - scoreDistanceKiller - FONT_SIZE, (FONT_SIZE - 18) / 2, gearScoreKiller);
            output.print(font, ITEM_SIZE * 6 - scoreDistanceVictim - FONT_SIZE, FONT_SIZE + ITEM_SIZE + (FONT_SIZE - 18) / 2, gearScoreVictim);

            let guildName = (event.Killer.AllianceName ? `[${event.Killer.AllianceName}]` : '') + event.Killer.GuildName;
            output.print(font, 4, (FONT_SIZE - 18) / 2, guildName ? guildName : 'N/A');
            guildName = (event.Victim.AllianceName ? `[${event.Victim.AllianceName}]` : '') + event.Victim.GuildName;
            output.print(font, 4, FONT_SIZE + ITEM_SIZE + (FONT_SIZE - 18) / 2, guildName ? guildName : 'N/A');

            if (event.TotalVictimKillFame < config.kill.minFame) {
                output.crop(0, 0, ITEM_SIZE * 6, FONT_SIZE);
            }
            output.quality(60);

            return iconsPromise;
        }).then(icons => {
            const swords = icons.swords.clone();
            swords.resize(32, 32);
            output.composite(swords, ITEM_SIZE * 6 - FONT_SIZE - 5, 0);
            const skull = icons.skull.clone();
            skull.resize(32, 32);
            output.composite(skull, ITEM_SIZE * 6 - FONT_SIZE - 5, ITEM_SIZE + FONT_SIZE);

            return new Promise((resolve, reject) => {
                output.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
            });
        });
    });
}

module.exports = { createImage, getItemImage, getItemUrl };
