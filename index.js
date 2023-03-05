const express = require('express');
const fs = require('fs');
const fetch = require('node-fetch');
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
geo = ["BE","BG","CZ","DK","DE","EE","IE","EL","ES","FR","HR","IT","CY","LV","LT","LU","HU","MT","NL","AT","PL",
"PT","RO","SI","SK","FI","SE","IS","LI","NO","CH","UK","ME","MK","AL","RS","TR","AD","BY","BA","XK","MD","RU",
"SM","UA","AM","AZ","GE"];

sinceTimePeriod = 2000;
formatt = 'JSON';
langg = 'EN';

urls = [];

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
                urls.push(url);
                html += '<p>' + key + ': <a target="_blank" href=' + url + '>JSON</a> - <a target="_blank" href="https://ec.europa.eu/eurostat/databrowser/view/' + val.split('?',1)[0].toLowerCase() + '/default/table?lang=en">DATABASE</a></p>';
            }
        });

        urls.slice(0,1).forEach((url) => {
            fetch(url)
            .then(res => res.json())
            .then(data => {
                const filename = "dataa/" + url.split('?',1)[0].split('/').slice(-1);
                console.log(filename);

                fs.writeFile(filename + ".json", JSON.stringify(data), err => {
                    if (err) throw err;
                    console.log('Data written to file ' + filename + ".json");
                });

                const csvData = JSON2CSV(data);

                fs.writeFile(filename + ".csv", csvData, err => {
                    if (err) throw err;
                    console.log('Data written to file ' + filename + ".csv");
                });
            });
        });

        res.send(html);
    });
});

app.listen(3000);

function JSON2CSV(data) {
    // const columns = data.id.reverse();
    // const sizes = data.size.reverse();
    const impColumns = data.id.filter((_,i) => data.size[i] > 1).reverse();
    const impSizes = data.size.filter(i => i > 1).reverse();

    const dimLabels = Object.entries(data.dimension)
        .filter(([k,v]) => impColumns.includes(k))
        .map(([k,v]) => Object.values(v.category.label))
        .reverse();

    var csvText = impColumns.map(i => i.toUpperCase()).join(',');
    csvText += ',VALUE\n';
    for (var index in data.value) {
        const value = data.value[index];
        index = parseInt(index);

        var n = impColumns.length;
        var colNames = new Array(n).fill(0);
        var i=0, ci=index;
        while(i < n) {
            colNames[i] = ci % impSizes[i];
            ci = ~~(ci/impSizes[i]);
            i += 1;
        }
        i=0;
        while(i < n) {
            csvText += (dimLabels[i][colNames[i]]).toString().replace(',',' ').replace(/\s+/g, ' ').trim() + ',';
            i += 1;
        }
        csvText += value.toString() + '\n';
    }
    // var columns = data.id.filter((_,i) => data.size[i] > 1);
    // columns.push("value");
    return csvText;
}