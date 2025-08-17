// TODO BUG: refreshing the page after saving changes metadata loses
// track of the saved changes since the metadata file is not
// imported in the beginning and we rely solely on localstorage
console.log("localStorage:", localStorage);

const BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const metadataMap = {};

let datasetMap = new Map();
let currentEditingCode = null; // Track currently editing dataset

if (localStorage) {
  if (
    !(
      localStorage.selectedDatasets &&
      localStorage.step &&
      localStorage.step === "2"
    )
  ) {
    // Something went wrong, reset to step 1
    localStorage.setItem("step", "1");
    window.location.reload(); // reload index.html and load step1
  }
  const datasets = JSON.parse(localStorage.selectedDatasets);
  console.log(datasets);
  for (let i = 0; i < datasets.length; i++) {
    datasetMap.set(datasets[i].code, datasets[i]);
    // TODO: put dimensionPrefs from saved nodes directly into metadataMap on step load
    if (datasets[i]._status?.metadata?.status) {
      metadataMap[datasets[i].code] = datasets[i];
    }
  }
}

console.log("datasetMap", datasetMap);

function getEurostatFormatCurrentTime() {
  const date = new Date();

  const pad = (num) => String(num).padStart(2, "0");

  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  // Get timezone offset in minutes and convert to HHMM
  const tzOffset = -date.getTimezoneOffset(); // invert sign
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzHours = pad(Math.floor(Math.abs(tzOffset) / 60));
  const tzMinutes = pad(Math.abs(tzOffset) % 60);

  const tzString = `${tzSign}${tzHours}${tzMinutes}`;

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${tzString}`;
}

function renderDatasets() {
  const tbody = document.querySelector("#dataset-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const data = [...datasetMap.values()];

  data.forEach((node, index) => {
    const tr = document.createElement("tr");
    tr.id = `${node.code}_tr`;

    const eurostatLink = `https://ec.europa.eu/eurostat/databrowser/view/${node.code}/default/table?lang=en`;

    tr.innerHTML = `
      <td id="${node.code}_index_container"><span id="${node.code}_index">${index + 1}</span></td>
      <td id="${node.code}_description_container" class="fetch-dataset" title="Click to edit"><span id="${node.code}_description">${node.label} (${node.code})</span><span id="${node.code}_saved"></span></td>
      <td id="${node.code}_actions" class="actions"><a id="${node.code}_eurostat_link" class="link-database" href="${eurostatLink}" title="Open dataset" target="_blank" style="margin-right:10px">&#x1F517;</a><a id="${node.code}_remove_link" href="#" title="Delete row" class="link-remove">&#x274C;</a></td>
    `;

    if (node._status?.metadata?.status) {
      const savedSpan = tr.querySelector(`#${node.code}_saved`);
      savedSpan.innerHTML = " &#x1f4be;";
      savedSpan.title = "Saved";

      switch (node._status?.metadata?.status) {
        case "error": {
          tr.classList.add("error");
          break;
        }
        case "warning": {
          tr.classList.add("warning");
          break;
        }
        case "success": {
          tr.classList.add("success");
          break;
        }
        default: {
          break;
        }
      }
    }

    // Fetch logic
    tr.querySelector("td.fetch-dataset").addEventListener(
      "click",
      async (e) => {
        if (currentEditingCode) {
          const saveResponse = saveCurrentMetadata();
          if (!saveResponse.success) {
            alert(`Please fix errors before switching datasets:\n\n- ${saveResponse.errors?.join('\n- ')}`);
            return;
          }
        }
        tbody
          .querySelectorAll("tr.selected-row")
          .forEach((r) => r.classList.remove("selected-row"));

        tr.classList.add("selected-row");

        if (metadataMap[node.code]) {
          parseMetadata(node.code, metadataMap[node.code]);
        } else {
          console.log("isSaved?", node._status?.metadata?.status);
          
          const metadataResponse = await fetchBackendMetadata(node.code, handleMetadataResponse);
          console.log("metadataResponse", metadataResponse);

          // Copy all properties except 'data'
          var metadata = {};
          for (var key in metadataResponse) {
            if (metadataResponse.hasOwnProperty(key) && key !== "data") {
              metadata[key] = metadataResponse[key];
            }
          }

          let result;

          if (metadataResponse.hasOwnProperty("data")) {
            // successful
            result = {
              _status: {
                metadata: metadata,
              },
              label: metadataResponse.data.label,
              // title: metadataResponse.data.label,
              code: node.code,
              updated: metadataResponse.data.updated,
              description: metadataResponse.data.extension?.description,
              dimension: metadataResponse.data.dimension,
              dimensionPrefs: node.dimensionPrefs || metadataResponse.data.dimension,
            }

            if (Object.keys(result.dimensionPrefs).includes("geo")) {
              delete result.dimensionPrefs.geo;
            }
          } else {
            // some type of error occured, details in _status.metadata
            result = {
              _status: {
                metadata: metadata,
              },
              code: node.code,
              label: node.label,
            };
          }

          metadataMap[node.code] = result;
          datasetMap.set(node.code, result);
          parseMetadata(node.code, result);

          renderButtons();
        }

        currentEditingCode = node.code;
      }
    );

    // Remove button
    tr.querySelector("a.link-remove").addEventListener("click", (e) => {
      if(confirm(`Are you sure you want to remove ${node.code}?`)) {
        e.stopPropagation();
        currentEditingCode = null;
        datasetMap.delete(node.code);
        delete metadataMap[node.code];
        renderDatasets();
      }
    });

    tbody.appendChild(tr);
  });
}

async function fetchWithRetry(url, options = {}, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Fetch failed (${i + 1}/${retries}): ${err.message}`);
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed after ${retries} retries: ${err.message}`);
      }
    }
  }
}

function deepEqual(object1, object2) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false;
    }
  }

  return true;
}

function isObject(object) {
  return object != null && typeof object === "object";
}

async function fetchMetadata(node) {
  // Fetch only metadata, no values
  console.log("Fetch");
  return fetchWithRetry(`${BASE_URL}/${node.code}?geo=null`)
    .then((data) => {
      return data;
    })
    .catch((err) => {
      console.error(
        `Failed to fetch metadata for ${node.code}:\n${err.message}`
      );
      return err;
    });
}

async function fetchBackendMetadata(nodeCode, handler) {
  const body = {
    nodeCode: nodeCode,
    extraParams: { geo: "null" }, // API-specific
    controlParams: {}, // Future use
  };

  const response = await fetch('/fetch-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();

  if (handler) {
    handler(result);
  }

  return result;
}

function handleMetadataResponse(response) {
  switch (response.status) {
    case 'success': {
      const code = response.code;
      const data = response.data;
      console.log(code, 'success');
      const elem = document.getElementById(`${code}_tr`);
      elem.classList.remove("success", "warning", "error");
      elem.classList.add("success");
      break;
    }
    case 'warning': {
      const code = response.code;
      const message = response.message;
      const reason = response.reason;
      const userAction = response.userAction;
      console.warn(code, 'warning', message, reason, userAction);
      const elem = document.getElementById(`${code}_tr`);
      elem.classList.remove("success", "warning", "error");
      elem.classList.add("warning");
      break;
    }
    case 'error': {
      const code = response.code;
      const message = response.message;
      const reason = response.reason;
      const userAction = response.userAction;
      console.error(code, 'error', message, reason, userAction);
      const elem = document.getElementById(`${code}_tr`);
      elem.classList.remove("success", "warning", "error");
      elem.classList.add("error");
      break;
    }
    default: {
      console.error('Unhandled response status', response);
      break; 
    }
  }
}

function parseTime(t) {
  if (typeof t === "number" && Number.isFinite(t)) {
    return { year: t, suffix: "" };
  }

  if (typeof t !== "string") {
    return { year: -Infinity, suffix: "" };
  }

  const match = t.match(/^(\d+)(?:[-_]?([A-Za-z0-9]+))?$/);
  return match
    ? { year: +match[1], suffix: match[2] || "" }
    : { year: -Infinity, suffix: "" };
}

function compareTimes(a, b) {
  const ta = parseTime(a);
  const tb = parseTime(b);
  if (ta.year !== tb.year) return ta.year - tb.year;
  return ta.suffix.localeCompare(tb.suffix);
}

function saveCurrentMetadata() {
  if (!currentEditingCode) return {success: true};

  const metadata = metadataMap[currentEditingCode];
  const container = document.getElementById("edit-metadata-container");
  const form = container.querySelector("div");
  if (!form || !metadata) return {success: true};

  if (metadata?._status?.metadata?.status !== "success") {
    // success: True, as in, sure, you can go ahead and store the result, don't check it
    return {success: true};
  }

  let dimensionPrefs = {};

  const errors = [];

  for (const key in metadata.dimension) {
    if (key === "geo") continue;

    const checkboxes = form.querySelectorAll(`input[name="${key}"]`);
    
    //if (!checkboxes.length) continue;

    // technically there has to be at least one checkbox, but we cover this edge case anyway

    const checkboxArray = Array.from(checkboxes);
    
    const hasValues = checkboxArray.length !== 0;

    const selected = checkboxArray
      .filter((c) => c.checked)
      .map((c) => c.value);

    if (selected.length === 0 && hasValues) {
      errors.push(`Please select at least one value for ${key}`);
    } else {
      const dimensionData = metadata.dimension[key];

      dimensionPrefs[key] = {
        label: dimensionData.label,
        category: {
          index: Object.fromEntries(
            Object.entries(dimensionData.category.index).filter(([key]) =>
              selected.includes(key)
            )
          ),
          label: Object.fromEntries(
            Object.entries(dimensionData.category.label).filter(([key]) =>
              selected.includes(key)
            )
          ),
        },
      };
    }
  }

if ("time" in metadata.dimension) {
    const sinceCheckbox = form.querySelector("#sinceTimePeriodCheckbox");
    const untilCheckbox = form.querySelector("#untilTimePeriodCheckbox");
    const lastCheckbox = form.querySelector("#lastTimePeriodCheckbox");

    const sinceInput = form.querySelector("#sinceTimePeriodInput");
    const untilInput = form.querySelector("#untilTimePeriodInput");
    const lastInput = form.querySelector("#lastTimePeriodInput");

    // Disallow Last + (Since/Until) combo
    if (lastCheckbox?.checked && (sinceCheckbox?.checked || untilCheckbox?.checked)) {
      errors.push("'Last Time Period' cannot be used in combination with 'Since Time Period' or 'Until Time Period'");
    }

    function validateTimePeriodInput(label, value, minTime = 0, maxTime = 9999) {
      if (!value) return [`Please enter a valid value for '${label}'`];

      const parsed = parseTime(value);
      if (parsed.year === -Infinity) return [`'${label}' must be a number.`];

      if (compareTimes(value, minTime) < 0 || compareTimes(value, maxTime) > 0) {
        return [`'${label}' must be between ${minTime} and ${maxTime}`];
      }
      return [];
    }

    // Determine min/max time from metadata
    let minTime = 1000, maxTime = 9999;
    const timeCategories = Object.keys(metadata.dimension.time.category.index);
    if (timeCategories.length) {
      minTime = timeCategories.reduce((min, c) => compareTimes(min, c) < 0 ? min : c);
      maxTime = timeCategories.reduce((max, c) => compareTimes(max, c) > 0 ? max : c);
    }

    // Define checkbox/input/validation rules in one place
    const checks = [
      { checkbox: sinceCheckbox, input: sinceInput, label: "Since Time Period", min: minTime, max: maxTime },
      { checkbox: untilCheckbox, input: untilInput, label: "Until Time Period", min: minTime, max: maxTime },
      { checkbox: lastCheckbox, input: lastInput, label: "Last Time Period", min: 1, max: 9999 }
    ];

    let validInputs = true;
    for (const { checkbox, input, label, min, max } of checks) {
      if (checkbox?.checked) {
        const errs = validateTimePeriodInput(label, input?.value?.trim(), min, max);
        if (errs.length) {
          errors.push(...errs);
          validInputs = false;
        }
      }
    }

    // Additional since/until comparison check
    if (validInputs && sinceCheckbox?.checked && untilCheckbox?.checked) {
      if (compareTimes(sinceInput?.value?.trim(), untilInput?.value?.trim()) > 0) {
        errors.push("'Since Time Period' must be before 'Until Time Period'");
        validInputs = false;
      }
    }

    // Save preferences if all validations passed
    if (validInputs) {
      const timePrefs = dimensionPrefs.time || {
        label: metadata.dimension.time.label,
        category: dimensionPrefs.time?.category || { index: {}, label: {} },
      };

      if (sinceCheckbox?.checked) timePrefs.sinceTimePeriod = sinceInput?.value?.trim();
      if (untilCheckbox?.checked) timePrefs.untilTimePeriod = untilInput?.value?.trim();
      if (lastCheckbox?.checked) timePrefs.lastTimePeriod = lastInput?.value?.trim();

      dimensionPrefs.time = timePrefs;
    }
  }

  if (errors.length > 0) {
    console.warn("Errors while saving current metadata:", errors);
    return {success: false, errors: errors};
  }

  if (
    !deepEqual(
      metadataMap[currentEditingCode].dimensionPrefs,
      dimensionPrefs
    )
  ) {
    // Flag for file reset when saving
    metadataMap[currentEditingCode].hasChanges = true;
    metadataMap[currentEditingCode].dimensionPrefs = dimensionPrefs;
  }

  const node = datasetMap.get(currentEditingCode);
  node.dimensionPrefs = dimensionPrefs;
  datasetMap.set(currentEditingCode, node);
  return {success: true};
}

function parseMetadata(code, data) {
  const metadataTitle = document.getElementById("edit-metadata-title");
  const metadataDiv = document.getElementById("edit-metadata-div");
  metadataDiv.innerHTML = ""; // Clear previous content

  if (!data._status?.metadata?.status) {
    console.error("you missed something");
    console.log(data);
  }

  if(data._status.metadata.status !== "success") {
    const message = data._status.metadata.message;
    const reason = data._status.metadata.reason;
    let code = data._status.metadata.code;
    let status = data._status.metadata.status;
    let userAction = data._status.metadata.userAction;

    metadataTitle.innerText = `Metadata ${status}`;
    metadataDiv.innerHTML = `<div id="error_div"><h4>${reason}</h4></div><div id="userActionDiv"></div>`;
    const userActionDiv = metadataDiv.querySelector("#userActionDiv");

    for (let i = 0; i < userAction.length ; i++) {
      if (userAction[i] === "remove") {
        const removeButton = document.createElement("button");
        removeButton.classList.add("button-main");
        removeButton.innerText = "Remove dataset";
        removeButton.addEventListener('click', async (e) => {
          console.log(e);
          console.log(data._status.metadata);

          if (confirm(`Are you sure you want to remove ${code}?`)) {
            e.stopPropagation();
            datasetMap.delete(code);
            delete metadataMap[code];
            currentEditingCode = null;
            renderDatasets();
            metadataTitle.innerText = "Edit metadata";
            metadataDiv.innerHTML = "";
          }
        });
        userActionDiv.appendChild(removeButton);
      } else if (userAction[i] === "retry") {
        const retryButton = document.createElement("button");
        retryButton.classList.add("button-main");
        retryButton.innerText = "Retry";
        retryButton.addEventListener('click', async (e) => {
          console.log(e);
          console.log(data._status.metadata);

          e.stopPropagation();
          datasetMap.delete(code);
          delete metadataMap[code];
          // currentEditingCode = null;
          const elem = document.getElementById(`${code}_description_container`);
          elem.click();
        });
        userActionDiv.appendChild(retryButton);
      } else {
        console.error(`Unknown user action: ${userAction[i]}`);
      }
    }
    return;
  }

  const dimensions = data.dimension;
  const metadataForm = document.createElement("div");

  const requiredSelections = {};

  const hasOwn = Object.prototype.hasOwnProperty;

  Object.entries(dimensions).forEach(([key, dim]) => {
    if (key === "geo") {
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.classList.add("metadata-category");

    const toggle = document.createElement("button");
    toggle.classList.add("metadata-toggle-button");
    toggle.textContent = dim.label || key;

    const inner = document.createElement("div");
    inner.classList.add("metadata-line-container");

    toggle.onclick = () => {
      inner.style.display = inner.style.display === "none" ? "block" : "none";
    };

    const categories = dim.category?.index || {};
    const labels = dim.category?.label || {};

    for (const [cat, idx] of Object.entries(categories)) {
      const checkbox = document.createElement("input");
      checkbox.classList.add("metadata-checkbox");
      checkbox.type = "checkbox";
      checkbox.value = cat;
      checkbox.name = key;
      checkbox.id = `${key}_${cat}`;

      const prefs = metadataMap[code]?.dimensionPrefs?.[key]?.category?.index;
      checkbox.checked = prefs ? hasOwn.call(prefs, cat) : true;

      const label = document.createElement("label");
      label.classList.add("metadata-checkbox-label");
      label.setAttribute("for", checkbox.id);
      label.textContent = labels[cat] ? `${labels[cat]} (${cat})` : cat;
      label.classList.add("noselect");

      const line = document.createElement("div");
      line.classList.add("metadata-line");
      line.appendChild(checkbox);
      line.appendChild(label);
      inner.appendChild(line);
    }

    if (key === "time") {
      // Add sinceTimePeriod, untilTimePeriod checkboxes and inputs
      const timePeriodControlsWrapper = document.createElement("div");
      timePeriodControlsWrapper.id = "timePeriodControlsWrapper";

      const sinceCheckbox = document.createElement("input");
      sinceCheckbox.type = "checkbox";
      sinceCheckbox.id = "sinceTimePeriodCheckbox";
      sinceCheckbox.classList.add("metadata-checkbox");

      const sinceLabel = document.createElement("label");
      sinceLabel.textContent = "Since Time Period:";
      sinceLabel.setAttribute("for", "sinceTimePeriodCheckbox");
      sinceLabel.classList.add("metadata-checkbox-label", "noselect");

      const sinceInput = document.createElement("input");
      sinceInput.type = "text";
      sinceInput.placeholder = "e.g., 2010-S2";
      sinceInput.id = "sinceTimePeriodInput";
      sinceInput.classList.add("hidden");

      const untilCheckbox = document.createElement("input");
      untilCheckbox.type = "checkbox";
      untilCheckbox.id = "untilTimePeriodCheckbox";
      untilCheckbox.classList.add("metadata-checkbox");

      const untilLabel = document.createElement("label");
      untilLabel.textContent = "Until Time Period:";
      untilLabel.setAttribute("for", "untilTimePeriodCheckbox");
      untilLabel.classList.add("metadata-checkbox-label", "noselect");

      const untilInput = document.createElement("input");
      untilInput.type = "text";
      untilInput.placeholder = "e.g., 2020";
      untilInput.id = "untilTimePeriodInput";
      untilInput.classList.add("hidden");

      const lastCheckbox = document.createElement("input");
      lastCheckbox.type = "checkbox";
      lastCheckbox.id = "lastTimePeriodCheckbox";
      lastCheckbox.classList.add("metadata-checkbox");

      const lastLabel = document.createElement("label");
      lastLabel.textContent = "Last Time Period:";
      lastLabel.setAttribute("for", "lastTimePeriodCheckbox");
      lastLabel.classList.add("metadata-checkbox-label", "noselect");

      const lastInput = document.createElement("input");
      lastInput.type = "text";
      lastInput.placeholder = "e.g., 3";
      lastInput.id = "lastTimePeriodInput";
      lastInput.classList.add("hidden");

      // Preload from dimensionPrefs if exists
      const sinceTimePeriodPref = metadataMap[code]?.dimensionPrefs?.time?.sinceTimePeriod;
      const untilTimePeriodPref = metadataMap[code]?.dimensionPrefs?.time?.untilTimePeriod;
      const lastTimePeriodPref = metadataMap[code]?.dimensionPrefs?.time?.lastTimePeriod;

      if (sinceTimePeriodPref) {
        sinceCheckbox.checked = true;
        sinceInput.value = sinceTimePeriodPref;
        sinceInput.classList.remove("hidden");
      }
      if (untilTimePeriodPref) {
        untilCheckbox.checked = true;
        untilInput.value = untilTimePeriodPref;
        untilInput.classList.remove("hidden");
      }
      if (lastTimePeriodPref) {
        lastCheckbox.checked = true;
        lastInput.value = lastTimePeriodPref;
        lastInput.classList.remove("hidden");
      }

      function toggleTimeCheckboxes(sinceTimePeriod = false, untilTimePeriod = false, lastTimePeriod = false) {
        sinceTimePeriod ? sinceInput.classList.remove("hidden") : sinceInput.classList.add("hidden");
        untilTimePeriod ? untilInput.classList.remove("hidden") : untilInput.classList.add("hidden");
        lastTimePeriod ? lastInput.classList.remove("hidden") : lastInput.classList.add("hidden");
        
        const anyTimeControlsChecked = sinceTimePeriod || untilTimePeriod || lastTimePeriod;

        const timeCheckboxes = inner.querySelectorAll(`input[name="time"]`);
        timeCheckboxes.forEach((cb) => {
          cb.disabled = anyTimeControlsChecked;
          cb.parentElement.style.opacity = anyTimeControlsChecked ? 0.5 : 1;
        });
      }

      sinceCheckbox.addEventListener("change", () => {
        toggleTimeCheckboxes(sinceCheckbox.checked, untilCheckbox.checked, lastCheckbox.checked);
      });

      untilCheckbox.addEventListener("change", () => {
        toggleTimeCheckboxes(sinceCheckbox.checked, untilCheckbox.checked, lastCheckbox.checked);
      });

      lastCheckbox.addEventListener("change", () => {
        toggleTimeCheckboxes(sinceCheckbox.checked, untilCheckbox.checked, lastCheckbox.checked);
      });

      toggleTimeCheckboxes(sinceCheckbox.checked, untilCheckbox.checked, lastCheckbox.checked); // Initial state

      const line1 = document.createElement("div");
      const line2 = document.createElement("div");
      const line3 = document.createElement("div");

      line1.appendChild(sinceCheckbox);
      line1.appendChild(sinceLabel);
      line1.appendChild(sinceInput);

      line2.appendChild(untilCheckbox);
      line2.appendChild(untilLabel);
      line2.appendChild(untilInput);

      line3.appendChild(lastCheckbox);
      line3.appendChild(lastLabel);
      line3.appendChild(lastInput);

      timePeriodControlsWrapper.appendChild(line1);
      timePeriodControlsWrapper.appendChild(line2);
      timePeriodControlsWrapper.appendChild(line3);
      inner.prepend(timePeriodControlsWrapper);
    }

    wrapper.appendChild(toggle);
    wrapper.appendChild(inner);
    metadataForm.appendChild(wrapper);

    requiredSelections[key] = key !== "time";
  });

  metadataDiv.appendChild(metadataForm);
}

async function fetchAllMetadata() {
  const result = saveCurrentMetadata();
  if (!result.success) {
    alert(`Please fix errors before saving:\n\n- ${result.errors?.join('\n- ')}`);
    return;
  }

  // Fetch missing metadata if needed (all selected datasets)
  const fetchPromises = [];
  for (const code of datasetMap.keys()) {
    if (!metadataMap[code] || metadataMap[code].hasChanges) {
      fetchPromises.push(
        // fetchWithRetry(`${BASE_URL}/${code}?geo=null`)
        fetchBackendMetadata(code, handleMetadataResponse)
          .then((metadataResponse) => {

            console.log("metadataResponse", metadataResponse);

            // Copy all properties except 'data'
            var metadata = {};
            for (var key in metadataResponse) {
              if (metadataResponse.hasOwnProperty(key) && key !== "data") {
                metadata[key] = metadataResponse[key];
              }
            }

            let result;

            if (metadataResponse.hasOwnProperty("data")) {
              // successful
              result = {
                _status: {
                  metadata: metadata,
                },
                label: metadataResponse.data.label,
                // title: metadataResponse.data.label,
                code: code,
                updated: metadataResponse.data.updated,
                description: metadataResponse.data.extension?.description,
                dimension: metadataResponse.data.dimension,
                dimensionPrefs: (metadataMap[code] && metadataMap[code].dimensionPrefs) || metadataResponse.data.dimension,
              }

              if (Object.keys(result.dimensionPrefs).includes("geo")) {
                delete result.dimensionPrefs.geo;
              }
            } else {
              // some type of error occured, details in _status.metadata
              result = {
                _status: {
                  metadata: metadata,
                },
                code: code,
                label: datasetMap.get(code).label,
              };
            }

            metadataMap[code] = result;
            datasetMap.set(code, result);
          })
          .catch((err) => {
            console.error(
              `Failed to fetch metadata for ${code}: ${err.message}`
            );
          })
      );
    }
  }

  await Promise.all(fetchPromises);
}

async function saveAllMetadata() {
  const result = saveCurrentMetadata();
  if (!result.success) {
    alert(`Please fix errors before saving:\n\n- ${result.errors?.join('\n- ')}`);
    return;
  }
  localStorage.setItem(
    "selectedDatasets",
    JSON.stringify([...datasetMap.values()])
  );

  try {
    let files = [];
    datasetMap.forEach((_value, key) => {
      if (key in metadataMap) {
        files.push(metadataMap[key]);
      }
    });
    const res = await fetch("/save-metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        updated: getEurostatFormatCurrentTime(),
        files: files,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      // Validation or server error
      console.error("Validation failed:", data.errors);
      alert(`Failed to save metadata:\n\n- ${data.errors?.join('\n- ')}`);
      return false;
    }

    console.log(data.message);
    return true;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return false;
  }
}

const fetchMetadataBtn = document.getElementById("fetchMetadataBtn");
const saveMetadataBtn = document.getElementById("saveMetadataBtn");

fetchMetadataBtn.onclick = async() => {
  fetchMetadataBtn.disabled = true;
  fetchMetadataBtn.style.cursor = "wait";
  await fetchAllMetadata();
  renderButtons();
};

saveMetadataBtn.onclick = async() => {
  saveMetadataBtn.disabled = true;
  saveMetadataBtn.style.cursor = "wait";
  const success = await saveAllMetadata();
  renderButtons();
  if (success && confirm("Metadata saved successfully. Do you want to go to the map?")) {
    window.location.href = "/";
  }
};

function renderButtons() {
  let allFetched = true;
  for (const code of datasetMap.keys()) {
    if (!metadataMap[code]) {
      allFetched = false;
      break;
    }
  }

  fetchMetadataBtn.disabled = false;
  fetchMetadataBtn.style.cursor = "";
  saveMetadataBtn.disabled = false;
  saveMetadataBtn.style.cursor = "";
  

  if (!allFetched) {
    fetchMetadataBtn.classList.remove("hidden");
    saveMetadataBtn.classList.add("hidden");
  } else {
    saveMetadataBtn.classList.remove("hidden");
    fetchMetadataBtn.classList.add("hidden");
  }
}

renderDatasets();

renderButtons();

document.getElementById("backBtn").onclick = () => {
  // Save data to localStorage
  localStorage.setItem(
    "selectedDatasets",
    JSON.stringify([...datasetMap.values()])
  );
  localStorage.setItem("step", "1");
  window.location.reload(); // reload index.html and load step1
};
