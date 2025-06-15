const express = require('express');
const fs = require('fs');
const fetch_old = require('node-fetch');
const path = require('path');
const app = express();

const DATA_FOLDER_PATH = path.resolve(__dirname, 'data');
const FILES_FOLDER_PATH = path.join(DATA_FOLDER_PATH, 'files');
const PUBLIC_FOLDER_PATH = path.resolve(__dirname, 'public');
const INDEX_PATH = path.join(__dirname, 'public', 'index.html');

const BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";

// According to 
// https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Glossary:Country_codes

const geo = [
    // European Union (EU)
    "BE", // Belgium
    "BG", // Bulgaria
    "CZ", // Czechia
    "DK", // Denmark
    "DE", // Germany
    "EE", // Estonia
    "IE", // Ireland
    "EL", // Greece
    "ES", // Spain
    "FR", // France
    "HR", // Croatia
    "IT", // Italy
    "CY", // Cyprus
    "LV", // Latvia
    "LT", // Lithuania
    "LU", // Luxembourg
    "HU", // Hungary
    "MT", // Malta
    "NL", // Netherlands
    "AT", // Austria
    "PL", // Poland
    "PT", // Portugal
    "RO", // Romania
    "SI", // Slovenia
    "SK", // Slovakia
    "FI", // Finland
    "SE", // Sweden

    // European Free Trade Association (EFTA)
    "IS", // Iceland
    "LI", // Liechtenstein
    "NO", // Norway
    "CH", // Switzerland

    // EU candidate countries
    "BA", // Bosnia and Herzegovina
    "ME", // Montenegro
    "MD", // Moldova
    "MK", // North Macedonia
    "GE", // Georgia
    "AL", // Albania
    "RS", // Serbia
    "TR", // Türkiye
    "UA", // Ukraine

    // Potential candidates
    "XK", // Kosovo (designation in line with UNSCR 1244/1999)

    // // European Neighbourhood Policy (ENP) - East countries
    "AM", // Armenia
    "BY", // Belarus
    "AZ", // Azerbaijan

    // // European Neighbourhood Policy (ENP) - South countries
    // "DZ", // Algeria
    // "EG", // Egypt
    // "IL", // Israel
    // "JO", // Jordan
    // "LB", // Lebanon
    // "LY", // Libya
    // "MA", // Morocco
    // "PS", // Palestine
    // "SY", // Syria
    // "TN", // Tunisia

    // // Other countries
    // "AR", // Argentina
    // "AU", // Australia
    // "BR", // Brazil
    // "CA", // Canada
    // "CN_X_HK", // China (excluding Hong Kong)
    // "HK", // Hong Kong
    // "IN", // India
    // "JP", // Japan
    // "MX", // Mexico
    // "NG", // Nigeria
    // "NZ", // New Zealand
    // "RU", // Russia
    // "SG", // Singapore
    // "ZA", // South Africa
    // "KR", // South Korea
    // "TW", // Taiwan
    "UK", // United Kingdom
    // "US", // United States
];

const sinceTimePeriod = 2000;
const format = 'JSON';
const language = 'EN';

// Ensure folder structure
[DATA_FOLDER_PATH, FILES_FOLDER_PATH, PUBLIC_FOLDER_PATH].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// Serve static files
app.use('/data', express.static(DATA_FOLDER_PATH));
app.use('/public', express.static(PUBLIC_FOLDER_PATH));
// app.use(express.json()); // To parse JSON bodies

var bodyParser = require('body-parser');
app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));

// Route to save metadata
app.post('/save-metadata', (req, res) => {
  const metadata = req.body;

  const filePath = path.join(__dirname, 'data', 'metadata2.json');

  buildUrls(metadata.files);

  fs.writeFile(filePath, JSON.stringify(metadata, null, 2), (err) => {
    if (err) {
      console.error('Error writing metadata:', err);
      return res.status(500).send('Failed to save metadata');
    }
    res.send('Metadata saved successfully');
  });
});

// Routes
app.get('/', async (req, res) => {
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata2.json');

    try {
        const data = await fs.promises.readFile(metadataPath, 'utf-8');
        const metaData = JSON.parse(data);

        // metadata.updated, metadata.files[x].updated - when did we last update the data from eurostat
        // metadata.fetched  - when did we last download the data from eurostat
        // if 30 days passed since last metadata update or the files were never fetched, trigger update

        let needsUpdate = false;

        if (!metaData.fetched) {
            needsUpdate = true;
        } else {
            const timestamp = Date.parse(metaData.fetched) + (30 * 24 * 60 * 60 * 1000);
            //                                                day hour  min  sec  msec
            if (timestamp < Date.parse(metaData.updated)) {
                needsUpdate = true;
            } 
        }

        buildUrls(metaData.files);

        if (needsUpdate) {
            await updateDatabase(metaData); // will write metadata2.json back with new fetched
        }
        
        res.sendFile(INDEX_PATH);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error while reading metadata2.');
    }
});

app.get('/metadata', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'metadata', 'index.html'));
});

app.get('/links', (req, res) => {
    const pullMetadataPath = path.join(DATA_FOLDER_PATH, 'metadata2.json');

    fs.readFile(pullMetadataPath, (err, data) => {
        if (err) return res.status(404).send(err.message);

        const metaData = JSON.parse(data);
        buildUrls(metaData.files);

        const html = generateHtml(metaData.files);
        res.send(html);
    });
});

app.get('/update', (req, res) => {
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata2.json');

    fs.readFile(metadataPath, (err, data) => {
        if (err) return res.status(404).send(err.message);

        const metaData = JSON.parse(data);
        buildUrls(metaData.files);
        
        const html = generateHtml(metaData.files);
        res.send(html);
        
        // update in the background
        updateDatabase(metaData).catch(error => console.error("Error updating database (background):", error));
    });
});

function buildUrls(data) {
    for (const [fileName, file] of Object.entries(data)) {
        const values = [];

        if (!file.geo) {
            values.push("geo=" + geo.join("&geo="));
        }
        if (!file.format) {
            values.push(`format=${format}`);
        }
        if (!file.lang) {
            values.push(`lang=${language}`);
        }
        // if (!file.sinceTimePeriod) {
        //     values.push(`sinceTimePeriod=${sinceTimePeriod}`);
        // }

        for (const [key, dimension] of Object.entries(file.dimensionPrefs)) {
            if (key == "geo") {
                continue;
            }
            values.push(`${key}=${Object.keys(dimension.category.label).join(`&${key}=`)}`);
        }

        const url = `${BASE_URL}${fileName}?${values.join("&")}`;
        file.url = url;
    }
}

function generateHtml(data) {
    return Object.entries(data).map(([fileName, file]) => (
        `<p>${file.label || file.title} - ${fileName}: 
            <a target="_blank" href="${file.url}">JSON</a> - 
            <a target="_blank" href="https://ec.europa.eu/eurostat/databrowser/view/${fileName}/default/table?lang=en">DATABASE</a>
        </p>`
    )).join('');
}

function getEurostatFormatCurrentTime() {
  const date = new Date();

  const pad = (num) => String(num).padStart(2, "0");

  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  // Get timezone offset in minutes and convert to ±HHMM
  const tzOffset = -date.getTimezoneOffset(); // invert sign
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzHours = pad(Math.floor(Math.abs(tzOffset) / 60));
  const tzMinutes = pad(Math.abs(tzOffset) % 60);

  const tzString = `${tzSign}${tzHours}${tzMinutes}`;

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${tzString}`;
}

async function updateDatabase(metaData) {
    // metadata.updated, metadata.files[x].updated - when did we last update the data from eurostat
    // metadata.fetched  - when did we last download the data from eurostat

    // if 30 days passed since last metadata update or files never fetched, trigger update
    let needsUpdate = false;

    if (!metaData.fetched) {
        needsUpdate = true;
    } else {
        const timestamp = Date.parse(metaData.fetched) + (30 * 24 * 60 * 60 * 1000);
        //                                                day hour  min  sec  msec
        if (timestamp < Date.parse(metaData.updated)) {
            needsUpdate = true;
        } 
    }

    if (!needsUpdate) {
        console.log("NO DB UPDATE");
        return;
    }

    console.log("START DB UPDATE");

    const files = metaData.files;

    let currentTime = getEurostatFormatCurrentTime();
    
    const promises = Object.entries(files).map(([fileName, file]) =>
        fetch(file.url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    throw data.error;
                }

                const csvData = JSON2CSV(data);
                return { fileName: fileName, json: data, csv: csvData };
            })
            .catch(err => {
                console.error(err);
                return { error: err };
            })
    );

    const results = await Promise.all(promises);

    for (const response of results) {
        if (response.message || response.error) {
            console.log(response);
            continue;
        }
        const { fileName: fileName, json: jsonData, csv: csvData } = response;
        const jsonFilePath = path.join(FILES_FOLDER_PATH, `${fileName}.json`);
        const csvFilePath = path.join(FILES_FOLDER_PATH, `${fileName}.csv`);

        await fs.promises.writeFile(jsonFilePath, JSON.stringify(jsonData));
        console.log(`Updated ${fileName}.json`);
        await fs.promises.writeFile(csvFilePath, csvData);
        console.log(`Updated ${fileName}.csv`);

        metaData.files[fileName].fetched = currentTime;
    }

    metaData.fetched = currentTime;
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata2.json');
    await fs.promises.writeFile(metadataPath, JSON.stringify(metaData, null, 2));
    console.log("Updated metadata2.json");

    console.log("END DB UPDATE");
}

function JSON2CSV(data) {
    const alwaysInclude = ['time'];

    const includedDimensions = data.id.filter((dim, i) => data.size[i] > 1 || alwaysInclude.includes(dim));

    const dimensionInfo = includedDimensions.map(dim => ({
        name: dim,
        size: data.size[data.id.indexOf(dim)],
        labels: Object.keys(data.dimension[dim].category.label)
    }));

    const header = includedDimensions.map(dim => dim.toUpperCase()).join(',') + ',VALUE\n';
    let csv = header;

    for (const [flatIndexStr, value] of Object.entries(data.value)) {
        let flatIndex = parseInt(flatIndexStr, 10);
        const labelIndices = [];

        // Convert flat index to multidimensional index (reverse order)
        for (let i = dimensionInfo.length - 1; i >= 0; i--) {
            const { size } = dimensionInfo[i];
            labelIndices.unshift(flatIndex % size);
            flatIndex = Math.floor(flatIndex / size);
        }

        const labels = labelIndices.map((idx, i) => dimensionInfo[i].labels[idx]);

        csv += [...labels, value].join(',') + '\n';
    }

    return csv;
}

app.listen(3000, () => {
    console.log("Server listening at http://localhost:3000/");
});
