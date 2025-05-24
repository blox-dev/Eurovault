console.log(localStorage);

const NS = "urn:eu.europa.ec.eurostat.navtree";
const BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const metadataCache = {};
const metadataFetchMap = {};

let selectedTableCodes = new Set();
let selectedTableDataMap = new Map();
let currentEditingCode = null; // Track currently editing table

if (localStorage && localStorage.selectedTables) {
  const tables = JSON.parse(localStorage.selectedTables);
  console.log(tables);
  for (let i = 0; i < tables.length; i++) {
    selectedTableCodes.add(tables[i].code);
    selectedTableDataMap.set(tables[i].code, tables[i]);
  }
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

function renderSelectedTables() {
  const container = document.getElementById("selected-tables-container");
  // Remove old items but keep the heading
  container.querySelectorAll("p").forEach((el) => el.remove());

  selectedTableCodes.forEach((code) => {
    const node = selectedTableDataMap.get(code);
    const p = document.createElement("p");

    const text = document.createElement("span");
    text.textContent = `${node.title} (${node.code})`;
    p.appendChild(text);

    // Eurostat link icon
    const linkIcon = document.createElement("a");
    linkIcon.href = `https://ec.europa.eu/eurostat/databrowser/view/${node.code}/`;
    linkIcon.target = "_blank";
    linkIcon.style.marginLeft = "10px";
    linkIcon.style.textDecoration = "none";
    linkIcon.textContent = "🔗"; // Use icon font or emoji
    p.appendChild(linkIcon);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.style.marginLeft = "10px";
    removeBtn.onclick = () => {
      selectedTableCodes.delete(code);
      selectedTableDataMap.delete(code);
      renderSelectedTables();
    };
    p.appendChild(removeBtn);

    text.onclick = async function () {
      if (currentEditingCode) {
        const saved = saveCurrentMetadata();
        if (!saved) {
          alert("Please fix errors before switching tables.");
          return;
        }
      }

      currentEditingCode = node.code;

      if (metadataCache[node.code]) {
        parseMetadata(node.code, metadataCache[node.code]);
      } else {
        fetchMetadata(node);
      }
    };

    container.appendChild(p);
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

function fetchMetadata(node) {
  // Fetch only metadata, no values
  console.log("Fetch");
  fetchWithRetry(`${BASE_URL}/${node.code}?geo=null`)
    .then((data) => {
      metadataCache[node.code] = data;
      parseMetadata(node.code, data);
    })
    .catch((err) => {
      alert(`Failed to fetch metadata for ${node.code}:\n${err.message}`);
    });
}

function saveCurrentMetadata() {
  if (!currentEditingCode) return true;

  const metadata = metadataCache[currentEditingCode];
  const container = document.getElementById("edit-metadata-container");
  const form = container.querySelector("div");
  if (!form || !metadata) return true;

  const result = { dimension: {} };
  const errors = [];

  for (const key in metadata.dimension) {
    if (key === "geo") continue;

    const checkboxes = form.querySelectorAll(`input[name="${key}"]`);
    if (!checkboxes.length) continue;

    const selected = Array.from(checkboxes)
      .filter((c) => c.checked)
      .map((c) => c.value);

    const isRequired = key !== "time";

    if (isRequired && selected.length === 0) {
      errors.push(`Please select at least one value for ${key}`);
    } else if (selected.length > 0) {
      result.dimension[key] = selected;
    }
  }

  if (errors.length > 0) {
    console.warn("Errors while saving current metadata:", errors);
    return false;
  }

  result.label = metadata.label;
  result.lastModified = metadata.updated;
  result.description = metadata.extension?.description;

  metadataFetchMap[currentEditingCode] = result;
  return true;
}

function parseMetadata(code, data) {
  console.log(code);
  console.log(data);
  const container = document.getElementById("edit-metadata-container");
  container.innerHTML = `<h2>Edit Metadata</h2>`; // Clear previous content

  const dimensions = data.dimension;
  const metadataForm = document.createElement("div");

  const requiredSelections = {};

  Object.entries(dimensions).forEach(([key, dim]) => {
    if (key === "geo") {
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "10px";

    const toggle = document.createElement("button");
    toggle.textContent = dim.label || key;
    toggle.style.display = "block";
    toggle.style.marginBottom = "5px";
    toggle.style.cursor = "pointer";

    const inner = document.createElement("div");
    inner.style.display =
      key === "time" || Object.values(dim.category?.index).length > 10
        ? "none"
        : "block";
    inner.style.paddingLeft = "15px";

    toggle.onclick = () => {
      inner.style.display = inner.style.display === "none" ? "block" : "none";
    };

    const categories = dim.category?.index || {};
    const labels = dim.category?.label || {};

    for (const [cat, idx] of Object.entries(categories)) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = cat;
      checkbox.name = key;
      checkbox.id = `${key}_${cat}`;
      checkbox.checked = metadataFetchMap[code]
        ? metadataFetchMap[code].dimension[key].includes(cat)
        : true;

      // time always checked and disabled
      if (key === "time") {
        checkbox.disabled = true;
      }

      const label = document.createElement("label");
      label.setAttribute("for", checkbox.id);
      label.textContent = labels[cat] || cat;

      const line = document.createElement("div");
      line.appendChild(checkbox);
      line.appendChild(label);
      inner.appendChild(line);
    }

    wrapper.appendChild(toggle);
    wrapper.appendChild(inner);
    metadataForm.appendChild(wrapper);

    requiredSelections[key] = key !== "time";
  });

  // Save button
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.className = "bottom-right";
  saveBtn.onclick = async () => {
    const saved = saveCurrentMetadata();
    if (!saved) {
      alert("Please fix errors before saving.");
      return;
    }

    // Fetch missing metadata if needed (all selected tables)
    const fetchPromises = [];
    for (const code of selectedTableCodes) {
      if (!metadataFetchMap[code]) {
        const table = selectedTableDataMap.get(code);
        fetchPromises.push(
          fetchWithRetry(`${BASE_URL}/${code}?geo=null`)
            .then((data) => {
              metadataCache[code] = data;

              // Default selections if not manually configured
              const result = {
                label: data.label,
                updated: data.updated,
                description: data.extension?.description,
                dimension: {},
                x: "Year",
                y: "Value",
              };

              for (const [key, dim] of Object.entries(data.dimension)) {
                if (key === "geo") continue;
                result.dimension[key] = Object.keys(dim.category?.index || {});
              }

              metadataFetchMap[code] = result;
            })
            .catch((err) => {
              alert(`Failed to fetch metadata for ${code}: ${err.message}`);
            })
        );
      }
    }

    await Promise.all(fetchPromises);

    localStorage.setItem("metadataFetchMap", JSON.stringify(metadataFetchMap));

    fetch("/save-metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lastModified: getEurostatFormatCurrentTime(),
        files: metadataFetchMap,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save metadata");
        return res.text();
      })
      .then((msg) => alert(msg))
      .catch((err) => alert(`Error: ${err.message}`));

    console.log("All metadata saved to localStorage:", metadataFetchMap);
  };

  metadataForm.appendChild(saveBtn);
  container.appendChild(metadataForm);
}

renderSelectedTables();

document.getElementById("backBtn").onclick = () => {
  // Save data to localStorage
  localStorage.setItem(
    "selectedTables",
    JSON.stringify([...selectedTableDataMap.values()])
  );
  localStorage.setItem("step", "1");
  window.location.reload(); // reload index.html and load step1
};
