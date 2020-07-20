'use strict';

const request = require('request');
const API_URL = 'https://gameinfo.albiononline.com/api/gameinfo';

module.exports = class AlbionApi {
    constructor() {
    }

    /**
     * Request a resource from the Albion Online API.
     * @param baseUrl
     * @param path
     * @param queries
     * @returns {Promise<unknown>}
     */
    baseRequest(baseUrl, path, queries) {
        const qs = queries
            ? Object.entries(queries).map((query) => query.join('=')).join('&')
            : '';
        const url = `${baseUrl}${path}?${qs}`;
        return new Promise((resolve, reject) => {
            request(url, (error, response, body) => {
                if (error || (response && response.statusCode === 404)) {
                    reject(error || response);
                    return;
                }
                const requestBody = body.replace(/\n/g, ' ').replace(/\r/g, '').trim();
                try {
                    // replacements needed for status.txt
                    resolve(JSON.parse(requestBody));
                } catch (error) {
                    reject(`JSON parse error - ${path}\n${requestBody}`);
                }
            });
        });
    }

    /**
     * Get an array of Kills.
     */
    getEvents(options) {
        options = options || {};
        const queries = {
            limit: options.limit || 51,
            offset: options.offset || 0,
            sort: options.sort || 'recent',
        };
        return this.baseRequest(API_URL, `/events`, queries);
    }

    /**
     * Get an array of Battles.
     */
    getBattles(options) {
        options = options || {};
        const queries = {
            limit: options.limit || 51,
            offset: options.offset || 0,
            sort: options.sort || 'recent',
        };
        return this.baseRequest(API_URL, `/battles`, queries);
    }
};
