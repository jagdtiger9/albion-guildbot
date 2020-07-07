'use strict';

const Jimp = require('jimp');
const config = require('../config');

const DIV_SIZE = 2;
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
        'https://render.albiononline.com/v1/item/',
        `${item.Type}.png`,
        `?count=${item.Count}`,
        `&quality=${item.Quality}`,
    ].join('');
}

function getItemImage(item, size) {
    return Jimp.read(getItemUrl(item)).then(image => {
        image.resize(size, size);
        return [image, item.Count];
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
    const NUM = 9;
    const inventory = event['Victim'].Inventory.filter(item => item !== null && item.Type.indexOf('TRASH') === -1);
    const equipment = [
        event['Killer'].Equipment.MainHand,
        event['Killer'].Equipment.OffHand,
        event['Killer'].Equipment.Armor,
        event['Killer'].Equipment.Shoes,
        event['Killer'].Equipment.Head,
        event['Killer'].Equipment.Cape,
        event['Killer'].Equipment.Mount,
        event['Killer'].Equipment.Potion,
        event['Killer'].Equipment.Food,
        event[target].Equipment.MainHand,
        event[target].Equipment.OffHand,
        event[target].Equipment.Armor,
        event[target].Equipment.Shoes,
        event[target].Equipment.Head,
        event[target].Equipment.Cape,
        event[target].Equipment.Mount,
        event[target].Equipment.Potion,
        event[target].Equipment.Food,
    ].concat(inventory);

    return Promise.all(equipment.map(item => item
        ? getItemImage(item, ITEM_SIZE)
        : Promise.resolve([new Jimp(ITEM_SIZE, ITEM_SIZE), 0])
    )).then(images => {
        let inventory = images.slice(NUM * 2);
        let height = inventory.length ? Math.ceil(inventory.length / NUM) : 0;

        const output = new Jimp(ITEM_SIZE * NUM, (ITEM_SIZE + FONT_SIZE) * 2 + (height ? ITEM_SIZE * height + DIV_SIZE : 0));

        return Jimp.loadFont(Jimp.FONT_SANS_8_WHITE).then(font => {
            for (let i = 0; i < NUM; i++) {
                output.composite(images[i][0], ITEM_SIZE * i, FONT_SIZE);
                if (images[i][1]) {
                    output.print(font, (i + 1) * ITEM_SIZE - 18, FONT_SIZE + ITEM_SIZE - 20, images[i][1]);
                }
            }
            for (let i = NUM; i < 2 * NUM; i++) {
                output.composite(images[i][0], ITEM_SIZE * (i - NUM), FONT_SIZE * 2 + ITEM_SIZE);
                if (images[i][1]) {
                    output.print(font, (i - NUM + 1) * ITEM_SIZE - 18, FONT_SIZE * 2 + ITEM_SIZE * 2 - 20, images[i][1]);
                }
            }
            fillRectangle(output, Jimp.rgbaToInt(0, 0, 0, 255), 0, 4, ITEM_SIZE * NUM, FONT_SIZE - 4);
            fillRectangle(output, Jimp.rgbaToInt(0, 0, 0, 255), 0, 4 + FONT_SIZE + ITEM_SIZE, ITEM_SIZE * NUM, ITEM_SIZE + 2 * FONT_SIZE - 4);
            if (inventory.length) {
                fillRectangle(output, Jimp.rgbaToInt(0, 0, 0, 255), 0, 2 * FONT_SIZE + 2 * ITEM_SIZE, ITEM_SIZE * NUM, 2 * ITEM_SIZE + 2 * FONT_SIZE + DIV_SIZE);
                let Y_START = DIV_SIZE + FONT_SIZE * 2 + ITEM_SIZE * 2;
                for (let i = 0; i < inventory.length; i++) {
                    output.composite(images[NUM * 2 + i][0], ITEM_SIZE * (i % NUM), Y_START + Math.floor(i / NUM) * ITEM_SIZE);
                    if (images[NUM * 2 + i][1]) {
                        output.print(font, (i % NUM + 1) * ITEM_SIZE - 18, Y_START + (Math.floor(i / NUM) + 1) * ITEM_SIZE - 20, images[NUM * 2 + i][1]);
                    }
                }
            }

            return fontPromise;
        }).then(font => {
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

            output.print(font, ITEM_SIZE * NUM - scoreDistanceKiller - FONT_SIZE, (FONT_SIZE - 18) / 2, gearScoreKiller);
            output.print(font, ITEM_SIZE * NUM - scoreDistanceVictim - FONT_SIZE, FONT_SIZE + ITEM_SIZE + (FONT_SIZE - 18) / 2, gearScoreVictim);

            let guildName = (event.Killer.AllianceName ? `[${event.Killer.AllianceName}]` : '') + event.Killer.GuildName;
            output.print(font, 4, (FONT_SIZE - 18) / 2, guildName ? guildName : 'N/A');
            guildName = (event.Victim.AllianceName ? `[${event.Victim.AllianceName}]` : '') + event.Victim.GuildName;
            output.print(font, 4, FONT_SIZE + ITEM_SIZE + (FONT_SIZE - 18) / 2, guildName ? guildName : 'N/A');

            if (event.TotalVictimKillFame < config.kill.minFame) {
                output.crop(0, 0, ITEM_SIZE * NUM, FONT_SIZE);
            }
            output.quality(60);

            return iconsPromise;
        }).then(icons => {
            const swords = icons.swords.clone();
            swords.resize(32, 32);
            output.composite(swords, ITEM_SIZE * NUM - FONT_SIZE - 5, 0);
            const skull = icons.skull.clone();
            skull.resize(32, 32);
            output.composite(skull, ITEM_SIZE * NUM - FONT_SIZE - 5, ITEM_SIZE + FONT_SIZE);

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
