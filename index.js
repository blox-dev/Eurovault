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
app.use(express.json()); // To parse JSON bodies

// Route to save metadata
app.post('/save-metadata', (req, res) => {
  const metadata = req.body;

  const filePath = path.join(__dirname, 'data', 'metadata2.json');

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
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata.json');
    const pullMetadataPath = path.join(DATA_FOLDER_PATH, 'pull_metadata.json');

    try {
        let metaData;
        if (fs.existsSync(metadataPath)) {
            // metadata.json exists: load it, no need to update
            const data = await fs.promises.readFile(metadataPath);
            metaData = JSON.parse(data);
            buildUrls(metaData);

            res.sendFile(INDEX_PATH);
        } else {
            // metadata.json missing: load pull_metadata.json, update database first
            const data = await fs.promises.readFile(pullMetadataPath);
            metaData = JSON.parse(data);
            buildUrls(metaData);

            await updateDatabase(metaData);  // this will generate metadata.json
            res.sendFile(INDEX_PATH);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error while reading metadata.');
    }
});

app.get('/metadata', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'metadata', 'index.html'));
});

app.get('/links', (req, res) => {
    const pullMetadataPath = path.join(DATA_FOLDER_PATH, 'pull_metadata.json');

    fs.readFile(pullMetadataPath, (err, data) => {
        if (err) return res.status(404).send(err.message);

        const metaData = JSON.parse(data);
        buildUrls(metaData);

        const html = generateHtml(metaData);
        res.send(html);
    });
});

app.get('/update', (req, res) => {
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata.json');
    const pullMetadataPath = path.join(DATA_FOLDER_PATH, 'pull_metadata.json');
    const readPath = fs.existsSync(metadataPath) ? metadataPath : pullMetadataPath;

    fs.readFile(readPath, (err, data) => {
        if (err) return res.status(404).send(err.message);

        const metaData = JSON.parse(data);
        buildUrls(metaData);

        const html = generateHtml(metaData);
        res.send(html);

        // update in the background
        updateDatabase(metaData).catch(error => console.error("Error updating database (background):", error));
    });
});

function buildUrls(data) {
    for (const [fileName, file] of Object.entries(data)) {
        const params = [];

        if (!file.params.geo) {
            params.push("geo=" + geo.join("&geo="));
        }
        if (!file.params.format) {
            params.push(`format=${format}`);
        }
        if (!file.params.lang) {
            params.push(`lang=${language}`);
        }
        if (!file.params.sinceTimePeriod) {
            params.push(`sinceTimePeriod=${sinceTimePeriod}`);
        }

        for (const [key, values] of Object.entries(file.params)) {
            params.push(`${key}=${values.join(`&${key}=`)}`);
        }

        const url = `${BASE_URL}${fileName}?${params.join("&")}`;
        file.url = url;
    }
}

function generateHtml(data) {
    return Object.entries(data).map(([fileName, file]) => (
        `<p>${fileName}: 
            <a target="_blank" href="${file.url}">JSON</a> - 
            <a target="_blank" href="https://ec.europa.eu/eurostat/databrowser/view/${fileName}/default/table?lang=en">DATABASE</a>
        </p>`
    )).join('');
}

async function updateDatabase(metaData) {
    const promises = Object.values(metaData).map(file =>
        fetch(file.url)
            .then(res => res.json())
            .then(data => {
                const fileName = data.extension.id;
                const lastUpdated = Date.parse(data.updated);

                if (lastUpdated <= Date.parse(metaData[fileName].lastUpdated)) {
                    console.log(fileName, "not updated");
                    return { message: "already updated" };
                }

                const vals = {};
                const dims = { ...data.dimension };
                delete dims['geo'];
                delete dims['time'];

                for (const [k, v] of Object.entries(dims)) {
                    if (Object.values(v.category.label).length > 1) {
                        vals[k] = { ...v.category.label };
                    }
                }

                metaData[fileName] = {
                    ...metaData[fileName],
                    label: data.label,
                    values: vals,
                    description: data.extension.description || data.label,
                    lastUpdated: data.updated
                };

                const csvData = JSON2CSV(data);
                return { fileName, json: data, csv: csvData };
            })
            .catch(err => {
                console.error(err);
                return { error: err };
            })
    );

    const results = await Promise.all(promises);

    for (const response of results) {
        if (response.message || response.error) {
            continue;
        }

        const { fileName, json: jsonData, csv: csvData } = response;
        const jsonFilePath = path.join(FILES_FOLDER_PATH, `${fileName}.json`);
        const csvFilePath = path.join(FILES_FOLDER_PATH, `${fileName}.csv`);

        await fs.promises.writeFile(jsonFilePath, JSON.stringify(jsonData));
        console.log(`Data written to ${fileName}.json`);

        await fs.promises.writeFile(csvFilePath, csvData);
        console.log(`Data written to ${fileName}.csv`);
    }

    // Save updated metadata
    const metadataPath = path.join(DATA_FOLDER_PATH, 'metadata.json');
    await fs.promises.writeFile(metadataPath, JSON.stringify(metaData));
    console.log("Updated metadata.json");
}

function JSON2CSV(data) {
    const importantCols = data.id.filter((_, i) => data.size[i] > 1).reverse();
    const importantSizes = data.size.filter(size => size > 1).reverse();

    const dimensionLabels = Object.entries(data.dimension)
        .filter(([k]) => importantCols.includes(k))
        .map(([k, v]) => Object.keys(v.category.label))
        .reverse();

    let csv = importantCols.map(c => c.toUpperCase()).join(',') + ',VALUE\n';

    for (const [indexStr, value] of Object.entries(data.value)) {
        let index = parseInt(indexStr);
        let labels = [];

        importantSizes.forEach(size => {
            labels.push(index % size);
            index = Math.floor(index / size);
        });

        labels = labels.map((labelIndex, i) => dimensionLabels[i][labelIndex]);
        csv += [...labels, value].join(',') + '\n';
    }

    return csv;
}

app.listen(3000, () => {
    console.log("Server listening at http://localhost:3000/");
});
