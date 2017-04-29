"use strict";
let express = require('express');
let mongo = require('mongodb');
let https = require('https');
const dbUrl = `mongodb://${process.env.dbuser}:${process.env.dbpass}@ds062339.mlab.com:62339/mongo`
let options = {
    hostname: 'api.cognitive.microsoft.com',
    path: '/bing/v5.0/images/search',
    headers: {
        'Ocp-Apim-Subscription-Key': Math.random() > 0.5 ?
            process.env.key1 : process.env.key2
    },
    agent: false
}

function createSearchString(searchStr, offset) {
    let str = searchStr.replace(/ /g, '+');
    options.path += `?q=${str}&mkt=en-US`;
    if (offset) {
        options.path += `offset=${offset}`;
    }
}

async function inserHistory(searchStr, ipStr) {
    let conn = await mongo.MongoClient.connect(dbUrl)
        .catch(e => e);
    if (conn instanceof mongo.MongoError)
        return;
    let history = conn.collection('searchhistory');
    history.insertOne({
        term: searchStr,
        ip: ipStr,
        time: new Date()
    }, () => conn.close());
}

async function getHistory(ipStr) {
    let conn = await mongo.MongoClient.connect(dbUrl)
        .catch(e => e);
    if (conn instanceof mongo.MongoError)
        return [];
    let result = await conn.collection('searchhistory')
        .find({
            ip: ipStr
        }).toArray().catch(e => []);
    return result ? result : [];
}

function getSearchResult(imageList) {
    return imageList.map(img => ({
        url: img.contentUrl,
        snippet: img.name,
        thumbnail: img.thumbnailUrl,
        context: img.hostPageDisplayUrl
    }));
}

let app = express();
app.get('/', (req, res) => {
    //res.sendFile(__dirname + '/index.html');
    res.sendFile('index.html', {
        root: __dirname
    });
});
app.get('/api/imagesearch/:searchStr', (req, res) => {
    createSearchString(req.params.searchStr, req.query.offset);
    inserHistory(req.params.searchStr, req.ip);
    https.get(options, result => {
        let buffer = [],
            content;
        result.on('data', d => buffer.push(d))
            .on('end', () => {
                content = JSON.parse(Buffer.concat(buffer).toString());
                res.end(JSON.stringify(getSearchResult(content.value)));
            });
    });
});
app.get('/api/history', (req, res) => {
    getHistory(req.ip).then(result => {
        let history = result.map(i => ({
            term: i.term,
            when: new Date(i.time).toISOString()
        }));
        res.json(history);
    });
});

app.listen(process.env.PORT || 8080, () => console.log('app is running!'));