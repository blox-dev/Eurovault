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
        const metadata = JSON.parse(data);

        buildUrls(metadata.files);

        await updateDatabase(metadata); // may overwrite metadata2.json
        
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

        const metadata = JSON.parse(data);
        buildUrls(metadata.files);

        const html = generateHtml(metadata.files);
        res.send(html);
    });
});

app.get('/update', (req, res) => {
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata2.json');

    fs.readFile(metadataPath, (err, data) => {
        if (err) return res.status(404).send(err.message);

        const metadata = JSON.parse(data);
        buildUrls(metadata.files);
        
        const html = generateHtml(metadata.files);
        res.send(html);
        
        // update in the background
        updateDatabase(metadata).catch(error => console.error("Error updating database (background):", error));
    });
});

function buildUrls(data) {
    for (const file of data) {
        const filename = file.code;
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

        const url = `${BASE_URL}${filename}?${values.join("&")}`;
        file.url = url;
    }
}

function generateHtml(data) {
    return Object.entries(data).map(([filename, file]) => (
        `<p>${file.label || file.title} - ${filename}: 
            <a target="_blank" href="${file.url}">JSON</a> - 
            <a target="_blank" href="https://ec.europa.eu/eurostat/databrowser/view/${filename}/default/table?lang=en">DATABASE</a>
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

function moreThan30DaysApart (dateString1, dateString2) {
    const date1 = Date.parse(dateString1);
    const date2 = Date.parse(dateString2);

    return Math.abs(date1 - date2) > (30 * 24 * 60 * 60 * 1000);
    //                      day  hour min  sec  msec
}

async function updateDatabase(metadata) {
    console.log(`[${new Date().toLocaleTimeString()}] START DB UPDATE`);

    const files = metadata.files;

    let currentTime = getEurostatFormatCurrentTime();
    
    const promises = files.map((file) => {
        // metadata.updated, file.updated - when did we last update the data from eurostat
        // metadata.fetched, file.fetched  - when did we last download the data from eurostat
        // if we never downloaded data or 30 days passed since last download, trigger update
        const filename = file.code;
        if (file.fetched && !moreThan30DaysApart(currentTime, file.fetched)) {
            return {filename: filename, status: "info", message: "No update", reason: "Fresh" };
        }
        return fetch(file.url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    return {filename: filename, status: "error", message: "Fetch error", reason: data.error}
                }

                const csvData = JSON2CSV(data);
                return { filename: filename, status: "success", json: data, csv: csvData };
            })
            .catch(err => {
                return { filename: filename, status: "error", message: "Failed to fetch", reason: err };
            })
    });

    const results = await Promise.all(promises);

    for (const response of results) {
        const file = metadata.files.filter(x => x.code === response.filename)[0];

        if (response.status === "error") {
            // error response
            console.error(response);
            file.success = false;
            file.errorMessage = {message: response.message, reason: response.reason};
            continue;
        }
        if (response.status === "warning" || response.status === "info") {
            console.warn(response);
            file.success = true;
            continue;
        }
        if (response.status !== "success") {
            continue;
        }
        const { filename: filename, json: jsonData, csv: csvData } = response;
        const jsonFilePath = path.join(FILES_FOLDER_PATH, `${filename}.json`);
        const csvFilePath = path.join(FILES_FOLDER_PATH, `${filename}.csv`);

        await fs.promises.writeFile(jsonFilePath, JSON.stringify(jsonData));
        console.log(`Updated ${filename}.json`);
        await fs.promises.writeFile(csvFilePath, csvData);
        console.log(`Updated ${filename}.csv`);

        file.success = true;
        file.fetched = currentTime;
    }

    metadata.fetched = currentTime;
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata2.json');
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log("Updated metadata2.json");

    console.log(`[${new Date().toLocaleTimeString()}] END DB UPDATE`);
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
