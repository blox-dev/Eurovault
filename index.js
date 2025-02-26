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
app.use('/dataa', express.static('dataa'));
app.use('/public', express.static('public'));

// let EUROSTAT_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp?format=JSON&lang=EN&time=2019"

let BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";

// Relevant countries codes
geo = ["BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "ES", "FR", "HR", "IT", "CY", "LV", "LT", "LU", "HU", "MT", "NL", "AT", "PL",
    "PT", "RO", "SI", "SK", "FI", "SE", "IS", "LI", "NO", "CH", "UK", "ME", "MK", "AL", "RS", "TR", "AD", "BY", "BA", "XK", "MD", "RU",
    "SM", "UA", "AM", "AZ", "GE"];

let sinceTimePeriod = 2000;
let formatt = 'JSON';
let langg = 'EN';

// routes
app.get('/', async function (_req, res) {
    fs.readFile('./public/countries.geojson', (err, data) => {
        if (err) {
            res.status(404).send(err.message);
        }

        const geoDataJSON = JSON.parse(data);
        const geoData = JSON.stringify(geoDataJSON);

        // add check if metadataa.json exists => if it doesn't then run the code below, otherwise read from metadataa.json
        if (fileExists("./data/metadataaa.json")) {
            fs.readFile("./data/metadataaa.json", (err, data) => {
                if (err) {
                    res.status(404).send(err.message);
                }
                var metaData = JSON.parse(data);
                res.render('pages/index', { metaData: JSON.stringify(metaData), geoData: geoData});
                // res.render('pages/index2', { metaData: JSON.stringify(metaData), geoData: geoData});
            });
        } else {
            fs.readFile("./data/pull_metadata.json", (err, data) => {
                if (err) {
                    res.status(404).send(err.message);
                }
                var metaData = JSON.parse(data);
                // to add the URL field
                // TODO: make getHtml a pure function, add url separately
                getHtml(metaData);

                res.render('pages/index', { metaData: JSON.stringify(metaData), geoData: geoData});
                // res.render('pages/index2', { metaData: JSON.stringify(metaData), geoData: geoData});
                updateDatabase(metaData);
            });
        }
    });
});

app.get('/links', async function (req, res) {
    fs.readFile('./data/pull_metadata.json', (err, data) => {
        if (err) {
            res.status(404).send(err.message);
        }
        html = getHtml(JSON.parse(data));
        res.send(html);
    });
});

app.get('/update', async function (req, res) {
    if (fileExists("./data/metadataaa.json")) {
        fs.readFile("./data/metadataaa.json", (err, data) => {
            if (err) {
                res.status(404).send(err.message);
            }
            var metaData = JSON.parse(data);
            html = getHtml(metaData);
            res.send(html);
            updateDatabase(metaData);
        });
    } else {
        fs.readFile("./data/pull_metadata.json", (err, data) => {
            if (err) {
                res.status(404).send(err.message);
            }
            var metaData = JSON.parse(data);
            html = getHtml(metaData);
            res.send(html);
            updateDatabase(metaData);
        });
    }
});

function fileExists(filepath) {
    return fs.existsSync(filepath);
}

function updateDatabase(metaData) {
    var promises = [];

    Object.values(metaData).forEach((file) => {
        var prom = new Promise((resolve, reject) => {
            fetch(file.url)
                .then(res => res.json())
                .then(data => {
                    const fileName = data.extension.id;

                    // information hasn't been updated
                    // TODO: maybe find more minimal API to check last update time instead of redownloading the data?
                    const lastUpdated = Date.parse(data.updated);
                    if (lastUpdated <= Date.parse(metaData[fileName].lastUpdated)) {
                        console.log(fileName, "not updated");
                        resolve({ "message": "already updated" });
                    }

                    var vals = {};
                    var dims = Object.assign({}, data.dimension);
                    delete dims['geo'];
                    delete dims['time'];

                    Object.entries(dims).forEach(([k, v]) => {
                        if (Object.values(v.category.label).length > 1) {
                            vals[k] = Object.assign({}, v.category.label);
                        }
                    });

                    metaData[fileName] = {
                        ...metaData[fileName],
                        "label": data.label,
                        "values": vals,
                        "description": data.extension.description || data.label,
                        "lastUpdated": data.updated
                    }

                    const csvData = JSON2CSV(data);
                    resolve({ fileName: fileName, json: data, csv: csvData });
                })
                .catch(err => console.log(err));
        });
        promises.push(prom);
    });

    Promise.all(promises).then((values) => {
        console.log(values);
        values.forEach((response) => {
            if (response.message) {
                return;
            }
            const { fileName: fileName, json: jsonData, csv: csvData } = response;
            const jsonFilePath = "./dataa/" + fileName + '.json';
            const csvFilePath = "./dataa/" + fileName + '.csv';

            fs.writeFile(jsonFilePath, JSON.stringify(jsonData), err => {
                if (err) throw err;
                console.log('Data written to file ' + fileName + ".json");
            });

            fs.writeFile(csvFilePath, csvData, err => {
                if (err) throw err;
                console.log('Data written to file ' + fileName + ".csv");
            });
        });
        // update metadataaa.json
        fs.writeFile("./data/metadataaa.json", JSON.stringify(metaData), err => {
            if (err) throw err;
            console.log("Data written to metadataaa.json");
        })
    })
}

app.listen(3000, () => {
    console.log("Server listening at http://localhost:3000/")
});

function JSON2CSV(data) {
    // const columns = data.id.reverse();
    // const sizes = data.size.reverse();
    const impColumns = data.id.filter((_, i) => data.size[i] > 1).reverse();
    const impSizes = data.size.filter(i => i > 1).reverse();

    const dimLabels = Object.entries(data.dimension)
        .filter(([k, v]) => impColumns.includes(k))
        // .map(([k, v]) => Object.values(v.category.label))
        .map(([k, v]) => Object.keys(v.category.label))
        .reverse();

    var csvText = impColumns.map(i => i.toUpperCase()).join(',');
    csvText += ',VALUE\n';
    for (var index in data.value) {
        const value = data.value[index];
        index = parseInt(index);

        var n = impColumns.length;
        var colNames = new Array(n).fill(0);
        var i = 0, ci = index;
        while (i < n) {
            colNames[i] = ci % impSizes[i];
            ci = ~~(ci / impSizes[i]);
            i += 1;
        }
        i = 0;
        while (i < n) {
            // csvText += (dimLabels[i][colNames[i]]).toString().replace(',', ' ').replace(/\s+/g, ' ').trim() + ',';
            csvText += dimLabels[i][colNames[i]] + ',';
            i += 1;
        }
        csvText += value.toString() + '\n';
    }
    // var columns = data.id.filter((_,i) => data.size[i] > 1);
    // columns.push("value");
    return csvText;
}

function getHtml(data) {
    var html = "";
    Object.entries(data).forEach(function ([fileName, file]) {
        const paramNames = Object.keys(file.params);

        var params = [];
        if (!paramNames.includes("geo")) {
            params.push("geo=" + geo.join("&geo="));
        }
        if (!paramNames.includes("format")) {
            params.push("format=" + formatt);
        }
        if (!paramNames.includes("lang")) {
            params.push("lang=" + langg);
        }
        if (!paramNames.includes("sinceTimePeriod")) {
            params.push("sinceTimePeriod=" + sinceTimePeriod);
        }
        Object.entries(file.params).forEach(([k, v]) => {
            params.push(k + "=" + v.join("&" + k + "="))
        })
        const url = BASE_URL + fileName + "?" + params.join("&");
        file["url"] = url;
        html += '<p>' + fileName + ': <a target="_blank" href=' + url + '>JSON</a> - <a target="_blank" href="https://ec.europa.eu/eurostat/databrowser/view/' + fileName + '/default/table?lang=en">DATABASE</a></p>';
    });
    return html;
}
