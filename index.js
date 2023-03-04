const express = require('express');
const fs = require('fs');
const { format } = require('path');
const app = express();
const favicon = require('serve-favicon');

app.set('view engine', 'ejs');

// favicon
app.use(favicon(__dirname + "/public/favicon.ico"));

// static folders
app.use('/data', express.static('data'));
app.use('/public', express.static('public'));

// routes
app.get('/', async function (_req, res) {
    res.render('pages/index', {});
});

// EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp?format=JSON&lang=EN&time=2019"

BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
SOME_URL = BASE_URL + "nama_10_gdp?format=JSON&lang=EN&na_item=B1GQ&unit=CLV_I15&sinceTimePeriod=2000";
OTHER_URL = BASE_URL + "SDG_08_10?format=JSON&lang=EN";

// Relevant fields codes
iscedf13 = ["F01", "F02", "F03", "F04", "F05", "F0511", "F0512", "F052", "F053", "F054", "F06", "F07", "F071",
"F072", "F073", "F08", "F09", "F091", "F0911", "F092", "F0921", "F0922", "F0923", "F10", "F1011", "F1012",
"F1013", "F1014", "F1015", "F104"];

// Relevant countries codes
// "TR": "Türkiye" - maybe?
geo = ["BE","BG","CZ","DK","DE","EE","IE","EL","ES","FR","HR","IT","CY","LV","LT","LU","HU","MT","NL","AT","PL",
"PT","RO","SI","SK","FI","SE","IS","LI","NO","CH","UK","ME","MK","AL","RS","TR","BA","XK"];

sinceTimePeriod = 2000;
formatt = 'JSON';
langg = 'EN';

app.get('/update', async function(req, res) {
    fs.readFile('./data/pull_metadata.json', (err, data) => {
        if (err) {
            res.status(404).send(err.message);
        }
        data = JSON.parse(data);

        var html = "";
        Object.entries(data).forEach(([key, val]) => {
            if (val!=='') {
                var url = BASE_URL;
                url += val;
                if(url.slice(-1) === '?') {
                    url += "geo=" + geo.join("&geo=");
                } else {
                    url += "&geo=" + geo.join("&geo=");
                }
                if(!url.includes("format=")) {
                    url += "&format=" + formatt;
                }
                if(!url.includes("lang=")) {
                    url += "&lang=" + langg;
                }
                if(!url.includes("sinceTimePeriod=")) {
                    url += "&sinceTimePeriod=" + sinceTimePeriod;
                }
                html += '<p><a target="_blank" href=' + url + '>' + key + '</a></p>';

            }
        });
        res.send(html);
    });
});

app.listen(3000);