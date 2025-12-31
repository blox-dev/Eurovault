import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

import {getEurostatFormatCurrentTime, compareTimes, parseTime} from './public/js/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();


const DATA_FOLDER_PATH = path.resolve(__dirname, config.DATA_FOLDER);
const FILES_FOLDER_PATH = path.join(__dirname, config.FILES_FOLDER);
const PUBLIC_FOLDER_PATH = path.resolve(__dirname, config.PUBLIC_FOLDER);
const INDEX_PATH = path.join(__dirname, config.PUBLIC_FOLDER, 'index.html');
const METADATA_FILE = config.METADATA_FILE;

const BASE_URL = config.BASE_URL;

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

const format = 'JSON';
const language = 'EN';
const MAX_ROWS = 5000000;

// ensure folder structure
[DATA_FOLDER_PATH, FILES_FOLDER_PATH, PUBLIC_FOLDER_PATH].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// serve static files
app.use('/data', express.static(DATA_FOLDER_PATH));
app.use('/public', express.static(PUBLIC_FOLDER_PATH));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }));

function validateMetadataObject(metadata) {
  const errors = [];

  // root-level check
  if (!metadata.files || !Array.isArray(metadata.files)) {
    errors.push("Root object must contain 'files' as an array.");
    return errors;
  }

  for (let index = 0; index < metadata.files.length ; index++) {
    let file = metadata.files[index];
    
    // basic structural checks
    if (!file.code || typeof file.code !== "string") {
      errors.push(`File [${index}]: Missing file code`);
      continue;
    }
    const fileId = file.code;

    if (!file._status || typeof file._status !== "object") {
      errors.push(`File ${fileId}: Missing or invalid _status`);
      continue;
    }
    if (!file._status.metadata || typeof file._status.metadata !== "object") {
      errors.push(`File ${fileId}: Missing or invalid _status.metadata`);
    }

    if (!file.dimension || typeof file.dimension !== "object") {
      errors.push(`File ${fileId}: Missing or invalid dimension`);
      continue;
    }
    if (!file.dimensionPrefs || typeof file.dimensionPrefs !== "object") {
      errors.push(`File ${fileId}: Missing or invalid dimensionPrefs`);
      continue;
    }

    // count total number of rows, must be under 5mil (eurostat)
    // start by multiplying with number of countries fetched
    let totalRows = geo.length;

    // dimensionPrefs vs dimension check
    for (const prefKey of Object.keys(file.dimensionPrefs)) {
      if (!(prefKey in file.dimension)) {
        errors.push(`File ${fileId}: dimensionPrefs has key '${prefKey}' not present in dimension`);
      } else {
        // check that all categories in prefs exist in dimension
        const prefCat = file.dimensionPrefs[prefKey].category || {};
        const dimCat = file.dimension[prefKey].category || {};
        const dimIndex = dimCat.index || {};
        const catKeys = Object.keys(prefCat.index || {});

        if (!catKeys.length) {
          errors.push(`File ${fileId}: ${prefKey} has 0 selected values.`);
        }

        // we handle time approximation below
        if (prefKey !== "time" && catKeys.length) {
          totalRows *= catKeys.length;
        }
        for (const catKey of catKeys) {
          if (!(catKey in dimIndex)) {
            errors.push(`File ${fileId}: dimensionPrefs[${prefKey}] has invalid category '${catKey}' not in dimension`);
          }
        }
      }
    }

    // time validations (if present)
    if (file.dimension.time) {
      const timeCategories = Object.keys(file.dimension.time.category.index || {});
      let minTime = "1000", maxTime = "9999";
      if (timeCategories.length) {
        minTime = timeCategories.reduce((min, c) => compareTimes(min, c) < 0 ? min : c);
        maxTime = timeCategories.reduce((max, c) => compareTimes(max, c) > 0 ? max : c);
      }

      const prefs = file.dimensionPrefs.time || {};
      const { sinceTimePeriod, untilTimePeriod, lastTimePeriod } = prefs;

      if (lastTimePeriod && (sinceTimePeriod || untilTimePeriod)) {
        errors.push(`File ${fileId}: 'Last Time Period' cannot be combined with 'Since/Until Time Period'`);
      }

      function validateTime(label, value, min, max) {
        if (!value) return [`${label} is missing`];
        const parsed = parseTime(value);
        if (parsed.year === -Infinity) return [`${label} must be numeric`];
        if (compareTimes(value, min) < 0 || compareTimes(value, max) > 0) {
          return [`${label} must be between ${min} and ${max}`];
        }
        return [];
      }

      let validInputs = true;

      if (sinceTimePeriod) {
        const valErrors = validateTime("Since Time Period", sinceTimePeriod, minTime, maxTime);
        if (valErrors.length) {
          validInputs = false;
        }
        errors.push(...valErrors);
      }
      if (untilTimePeriod) {
        const valErrors = validateTime("Until Time Period", untilTimePeriod, minTime, maxTime);
        if (valErrors.length) {
          validInputs = false;
        }
        errors.push(...valErrors);
      }
      if (lastTimePeriod) {
        const valErrors = validateTime("Last Time Period", lastTimePeriod, "1", "9999");
        if (valErrors.length) {
          validInputs = false;
        }
        errors.push(...valErrors);        
      }

      if (validInputs && sinceTimePeriod && untilTimePeriod) {
        if (compareTimes(sinceTimePeriod, untilTimePeriod) > 0) {
          errors.push(`File ${fileId}: 'Since Time Period' must be before 'Until Time Period'`);
        }
      }

      // time approximation
      let totalTimes;

      if (!validInputs) {
        totalTimes = timeCategories.length;
      } else {
        if (lastTimePeriod) {
          totalTimes = Math.min(lastTimePeriod, timeCategories.length);
        } else {
          let betweenTimes = timeCategories.filter(x => {
            if (sinceTimePeriod && compareTimes(x, sinceTimePeriod) < 0) {
              return false;
            }
            if (untilTimePeriod && compareTimes(x, untilTimePeriod) > 0) {
              return false;
            }
            return true;
          })
          totalTimes = betweenTimes.length;
        }
      }

      totalRows *= totalTimes;
    }

    if (totalRows >= MAX_ROWS) {
      errors.push(`File ${fileId}: The requested extraction is too big, estimated ${totalRows} rows, max authorised is ${MAX_ROWS}, please change your filters to reduce the extraction size`);
    }
  }

  return errors;
}

app.post('/save-metadata', (req, res) => {
  const metadata = req.body;

  let errors = validateMetadataObject(metadata);

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors: errors,
    });
  }

  const filePath = path.join(DATA_FOLDER_PATH, METADATA_FILE);

  buildUrls(metadata.files);

  fs.writeFile(filePath, JSON.stringify(metadata, null, 2), (err) => {
    if (err) {
      console.error('Error writing metadata:', err);
      return res.status(500).json({
        success: false,
        errors: ['Failed to save metadata'],
      });
    }
    res.json({ success: true, message: 'Metadata saved successfully' });
  });
});

app.post('/fetch-metadata', async (req, res) => {
  const { nodeCode, extraParams = {}, controlParams = {} } = req.body;

  // construct URL with optional query string
  let url = `${BASE_URL}/${nodeCode}`;
  const query = new URLSearchParams(extraParams).toString();
  if (query) url += `?${query}`;

  const attemptFetch = async (attemptUrl) => {
    try {
      const response = await fetch(attemptUrl);
      const json = await response.json();
      return { ok: response.ok, data: json };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  const result = await attemptFetch(url);

  if (result.ok && !result.data?.error) {
    return res.json({
      code: nodeCode,
      status: 'success',
      id: 0,
      message: "Fetched metadata",
      data: result.data,
    });
  }

  // parse known error types
  const apiError = result.data?.error?.[0];

  if (apiError) {
    const { status, label } = apiError;

    // EXTRACTION_TOO_BIG -> retry with sinceTimePeriod
    if (label.includes("EXTRACTION_TOO_BIG") && !extraParams.sinceTimePeriod) {
      const retryUrl = `${BASE_URL}/${nodeCode}?${new URLSearchParams({
        ...extraParams,
        sinceTimePeriod: '9999',
      }).toString()}`;

      const retryResult = await attemptFetch(retryUrl);

      if (!retryResult.ok || retryResult.data?.error) {
        return res.json({
          code: nodeCode,
          status: 'error',
          id: 210,
          message: 'Error while fixing EXTRACTION_TOO_BIG',
          reason: retryResult.data?.error?.[0]?.label || 'Unknown retry failure',
          userAction: ['remove'],
        });
      }

      let retryData = retryResult.data;
      let dimension = retryData.dimension;

      // fetch time dimension values by constructing minimal query
      let newParams = {...extraParams};
      for (const [dimName, values] of Object.entries(dimension)) {
        const keys = Object.keys(values?.category?.index);
        if (keys.length) {
          newParams[dimName] = keys[0];
        }
      }

      const timeUrl = `${BASE_URL}/${nodeCode}?${new URLSearchParams({
        ...newParams
      }).toString()}`;

      const timeResult = await attemptFetch(timeUrl);

      if (!timeResult.ok || timeResult.data?.error) {
        return res.json({
          code: nodeCode,
          status: 'error',
          id: 210,
          message: 'Error while fixing EXTRACTION_TOO_BIG',
          reason: timeResult.data?.error?.[0]?.label || 'Unknown retry failure',
          userAction: ['remove'],
        });
      }

      const timeData = timeResult.data?.dimension?.time;

      // inject timeData into retryResult and return it
      if (timeData) {
        retryData.dimension.time = timeData;

        const timeIndex = timeResult.data.id.findIndex(x => x === "time");
        if (timeIndex != -1) {
          const timeSize = timeResult.data.size[timeIndex];

          const retryTimeIndex = retryData.id.findIndex(x => x === "time");
          if (retryTimeIndex != -1) {
            retryData.size[retryTimeIndex] = timeSize;
          }
        } 
      }

      return res.json({
        code: nodeCode,
        status: 'success',
        id: 0,
        message: "Fetched metadata",
        data: retryData,
      });
    };

    // async response, let user retry manually
    if (label.includes("ASYNCHRONOUS_RESPONSE")) {
      return res.json({
        code: nodeCode,
        status: 'warning',
        id: 100,
        message: 'ASYNCHRONOUS_RESPONSE',
        reason: label,
        userAction: ['retry', 'remove'],
      });
    };

    // unknown error: fail by default
    return res.json({
      code: nodeCode,
      status: 'error',
      id: 201,
      message: 'Unhandled Eurostat error',
      reason: label,
      userAction: ['remove'],
    });
  }

  // unhandled fetch/network error
  return res.status(500).json({
    status: 'error',
    code: nodeCode,
    error: result.error || 'Unknown error',
    userAction: ['remove'],
  });
});

app.get('/', async (req, res) => {
    const metadataPath = path.join(DATA_FOLDER_PATH, METADATA_FILE);

    try {
        const data = await fs.promises.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(data);

        buildUrls(metadata.files);

        // may overwrite METADATA_FILE
        await updateDatabase(metadata);
        
        res.sendFile(INDEX_PATH);
    } catch (error) {
        console.error(error);
        res.status(500).send(`Server error while reading ${METADATA_FILE}`);
    }
});

app.get('/metadata', (req, res) => {
  res.sendFile(path.join(PUBLIC_FOLDER_PATH, 'metadata', 'index.html'));
});

app.get('/links', (req, res) => {
    const pullMetadataPath = path.join(DATA_FOLDER_PATH, METADATA_FILE);

    fs.readFile(pullMetadataPath, (err, data) => {
        if (err) return res.status(404).send(err.message);

        const metadata = JSON.parse(data);
        buildUrls(metadata.files);

        const html = generateHtml(metadata.files);
        res.send(html);
    });
});

app.get('/update', (req, res) => {
    const metadataPath = path.join(DATA_FOLDER_PATH, METADATA_FILE);

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
        if (file._status?.metadata?.status !== "success") {
          continue;
        }
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

        for (const [key, dimension] of Object.entries(file.dimensionPrefs)) {
            if (key == "geo") {
                continue;
            }
            if (key == "time") {
              let skip = false;
              if (dimension.sinceTimePeriod) {
                values.push(`sinceTimePeriod=${dimension.sinceTimePeriod}`);
                skip = true;
              }
              if (dimension.untilTimePeriod) {
                values.push(`untilTimePeriod=${dimension.untilTimePeriod}`);
                skip = true;
              }
              if (dimension.lastTimePeriod) {
                values.push(`lastTimePeriod=${dimension.lastTimePeriod}`);
                skip = true;
              }
              if (skip) continue;
            }
            if (Object.keys(dimension.category.label).length) {
              values.push(`${key}=${Object.keys(dimension.category.label).join(`&${key}=`)}`);
            }
        }

        const url = `${BASE_URL}/${filename}?${values.join("&")}`;
        file.url = url;
    }
}

function generateHtml(data) {
    const rows = Object.entries(data).map(([index, file]) => `
        <tr>
            <td>${index}</td>
            <td>${file.label || file.title}</td>
            <td><a target="_blank" href="https://ec.europa.eu/eurostat/databrowser/view/${file.code}/default/table?lang=en">VIEW</a></td>
            <td><a target="_blank" href="${file.url}">JSON</a></td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Data Table</title>
            <style>
                table {
                    border-collapse: collapse;
                    width: 100%;
                }
                th, td {
                    border: 1px solid #ccc;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f2f2f2;
                }
                a {
                    color: #1a0dab;
                    text-decoration: none;
                }
                a:hover {
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <table>
                <thead>
                    <tr>
                        <th>Index</th>
                        <th>Title</th>
                        <th>Eurostat View</th>
                        <th>JSON Data</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </body>
        </html>
    `;
}

function moreThan30DaysApart (dateString1, dateString2) {
    const date1 = Date.parse(dateString1);
    const date2 = Date.parse(dateString2);

    return Math.abs(date1 - date2) > (30 * 24 * 60 * 60 * 1000);
    //                                day  hour min  sec  msec
}

async function updateDatabase(metadata) {
    console.log(`[${new Date().toLocaleTimeString()}] START DB UPDATE`);

    const files = metadata.files;

    let currentTime = getEurostatFormatCurrentTime();

    function isEmpty(obj) {
      for (var prop in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) {
          return false;
        }
      }
      return true;
    }
    
    const promises = files.map((file) => {
        // file.updated - when did eurostat last update the data
        // file.fetched  - when did we last download the data from eurostat
        // metadata.updated - when did we last update the metadata file
        // if we never downloaded data or 30 days passed since last download, trigger update
        const code = file.code;
        if (!file._status?.metadata?.status) {
          return {code: code, status: "error", id: 599, message: "Metadata error", reason: "Something is very wrong with the metadata"};
        }
        if (file._status.metadata.status !== "success") {
          return {code: code, status: "error", id: 500, message: "Metadata error", reason: "Metadata not fetched"};
        }
        if ((file._status.data?.status === "success") && !moreThan30DaysApart(currentTime, file._status.data?.fetched)) {
          return {code: code, status: "success", id: 302, message: "No update", reason: "Data updated less than 30 days ago" };
        }
        return fetch(file.url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                  // mark asynchronous response as warning only
                  if (data.error.label?.includes("ASYNCHRONOUS_RESPONSE")) {
                    return {code: code, status: "warning", id: 400, message: 'ASYNCHRONOUS_RESPONSE', reason: label};
                  }
                  return {code: code, status: "error", id: 501, message: "Failed to fetch data", reason: data.error};
                }
                // no data in response
                if (isEmpty(data.value)) {
                    return { code: code, status: "error", id: 502, message: "Failed to fetch data", reason: "The request fetched no data" };
                }

                const csvData = JSON2CSV(data);
                return { code: code, status: "success", id: 300, message: "Fetched data", json: data, csv: csvData };
            })
            .catch(err => {
                return { code: code, status: "error", id: 501, message: "Failed to fetch data", reason: err };
            })
    });

    const results = await Promise.all(promises);

    for (const response of results) {
        const file = metadata.files.filter(x => x.code === response.code)[0];

        // copy all properties except 'json' and 'csv'
        let dataStatus = {};
        for (var key in response) {
          if (response.hasOwnProperty(key) && key !== "json" && key !== "csv") {
            dataStatus[key] = response[key];
          }
        }

        file._status.data = dataStatus;

        if (response.status !== "success") {
          console.error(response);
          continue;
        }
        
        if (response.id === 302) {
          // data doesn't need an update
          continue;
        }

        const { code: code, json: jsonData, csv: csvData } = response;
        const jsonFilePath = path.join(FILES_FOLDER_PATH, `${code}.json`);
        const csvFilePath = path.join(FILES_FOLDER_PATH, `${code}.csv`);

        await fs.promises.writeFile(jsonFilePath, JSON.stringify(jsonData));
        console.log(`Updated ${code}.json`);
        await fs.promises.writeFile(csvFilePath, csvData);
        console.log(`Updated ${code}.csv`);

        file._status.data.fetched = currentTime;
    }

    // metadata.fetched = currentTime;
    const metadataPath = path.join(DATA_FOLDER_PATH, METADATA_FILE);
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`Updated ${METADATA_FILE}`);

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

        // convert flat index to multidimensional index (reverse order)
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

export {
  app,
  validateMetadataObject,
  buildUrls,
  generateHtml,
  moreThan30DaysApart,
  JSON2CSV,
};