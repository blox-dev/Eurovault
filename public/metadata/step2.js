console.log("localStorage:", localStorage);

const NS = "urn:eu.europa.ec.eurostat.navtree";
const BASE_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const metadataFetchMap = {};

let selectedTableDataMap = new Map();
let currentEditingCode = null; // Track currently editing table

if (localStorage) {
  if (
    !(
      localStorage.selectedTables &&
      localStorage.step &&
      localStorage.step === "2"
    )
  ) {
    // Something went wrong, reset to step 1
    localStorage.setItem("step", "1");
    window.location.reload(); // reload index.html and load step1
  }
  const tables = JSON.parse(localStorage.selectedTables);
  console.log(tables);
  for (let i = 0; i < tables.length; i++) {
    selectedTableDataMap.set(tables[i].code, tables[i]);
    // TODO: put dimensionPrefs from saved nodes directly into metadataFetchMap on step load
    if (tables[i].isSaved) {
      metadataFetchMap[tables[i].code] = tables[i];
    }
  }
}

console.log("selectedTableDataMap", selectedTableDataMap);

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

function renderSelectedTables() {
  const tbody = document.querySelector("#selected-tables-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const data = [...selectedTableDataMap.values()];

  data.forEach((node, index) => {
    const tr = document.createElement("tr");

    if (node.isSaved) {
      tr.classList.add("saved");
    }

    const eurostatLink = `https://ec.europa.eu/eurostat/databrowser/view/${node.code}/default/table?lang=en`;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td class="fetch-dataset">${node.title} (${node.code})</td>
      <td class="actions"><a class="link-database" href="${eurostatLink}" title="Open dataset" target="_blank" style="margin-right:10px">&#x1F517;</a><a href="#" title="Delete row" class="link-remove">&#x274C;</a></td>
    `;
    // Fetch logic
    tr.querySelector("td.fetch-dataset").addEventListener(
      "click",
      async (e) => {
        // update stuff
        tbody
          .querySelectorAll("tr.selected-row")
          .forEach((r) => r.classList.remove("selected-row"));

        e?.target?.parentElement.classList.add("selected-row");

        if (currentEditingCode) {
          const saved = saveCurrentMetadata();
          if (!saved) {
            alert("Please fix errors before switching tables.");
            return;
          }
        }

        if (node.isSaved && !metadataFetchMap[node.code]) {
          console.log("isSaved");
          // TODO: maybe don't fetch again?
          // Have to account for changes in the data structure at Eurostat
          const res = await fetchMetadata(node);
          if (res.message) {
            return;
          }
          // Default selections if not manually configured
          const result = {
            label: res.label,
            title: res.label,
            code: node.code,
            updated: res.updated,
            description: res.extension?.description,
            dimension: res.dimension,
            dimensionPrefs: res.dimension,
          };

          // Attach user preferences
          if (node.dimensionPrefs) {
            result.dimensionPrefs = node.dimensionPrefs;
          }

          metadataFetchMap[node.code] = result;
          selectedTableDataMap.set(node.code, result);
          parseMetadata(node.code, result);
        } else if (metadataFetchMap[node.code]) {
          parseMetadata(node.code, metadataFetchMap[node.code]);
        } else {
          const res = await fetchMetadata(node);
          if (res.message) {
            return;
          }
          // Default selections if not manually configured
          const result = {
            label: res.label,
            title: res.label,
            code: node.code,
            updated: res.updated,
            description: res.extension?.description,
            dimension: res.dimension,
            dimensionPrefs: res.dimension,
          };

          metadataFetchMap[node.code] = result;
          selectedTableDataMap.set(node.code, result);
          parseMetadata(node.code, result);
        }

        if (!currentEditingCode) {
          // Show save buttons
          const saveBtn = document.getElementById("saveBtn");
          saveBtn.onclick = saveMetadata;
          saveBtn.classList.remove("hidden");

          const saveMapBtn = document.getElementById("saveMapBtn");
          saveMapBtn.onclick = async () => {
            await saveMetadata();
            window.location.href = "/";
          };
          saveMapBtn.classList.remove("hidden");
        }
        currentEditingCode = node.code;
      }
    );

    // Remove button
    tr.querySelector("a.link-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      selectedTableDataMap.delete(node.code);
      renderSelectedTables();
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

function saveCurrentMetadata() {
  if (!currentEditingCode) return true;

  const metadata = metadataFetchMap[currentEditingCode];
  const container = document.getElementById("edit-metadata-container");
  const form = container.querySelector("div");
  if (!form || !metadata) return true;

  // const result = {
  //   label: metadata.label,
  //   updated: metadata.updated,
  //   description: metadata.extension?.description,
  //   dimension: {},
  // };
  let dimensionPrefs = {};

  const errors = [];

  for (const key in metadata.dimension) {
    if (key === "geo") continue;

    const checkboxes = form.querySelectorAll(`input[name="${key}"]`);
    if (!checkboxes.length) continue;

    const selected = Array.from(checkboxes)
      .filter((c) => c.checked)
      .map((c) => c.value);

    if (selected.length === 0) {
      errors.push(`Please select at least one value for ${key}`);
    } else if (selected.length > 0) {
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

  if (errors.length > 0) {
    console.warn("Errors while saving current metadata:", errors);
    return false;
  }

  metadataFetchMap[currentEditingCode].dimensionPrefs = dimensionPrefs;

  const node = selectedTableDataMap.get(currentEditingCode);
  node.dimensionPrefs = dimensionPrefs;
  selectedTableDataMap.set(currentEditingCode, node);
  return true;
}

function parseMetadata(code, data) {
  // console.log(code);
  // console.log(data);
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
    inner.style.display = "block";
    inner.style.paddingLeft = "15px";

    toggle.onclick = () => {
      inner.style.display = inner.style.display === "none" ? "block" : "none";
    };

    const categories = dim.category?.index || {};
    const labels = dim.category?.label || {};

    const selectedItems =
      metadataFetchMap[code] && metadataFetchMap[code].dimensionPrefs
        ? Object.keys(metadataFetchMap[code].dimensionPrefs[key].category.index)
        : null;

    // console.log(selectedItems);

    for (const [cat, idx] of Object.entries(categories)) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = cat;
      checkbox.name = key;
      checkbox.id = `${key}_${cat}`;
      checkbox.checked = selectedItems ? selectedItems.includes(cat) : true;

      // time always checked
      if (key === "time" || Object.values(dim.category?.index).length === 1) {
        checkbox.checked = true;
        // checkbox.disabled = true;
      }

      const label = document.createElement("label");
      label.setAttribute("for", checkbox.id);
      label.textContent = labels[cat] ? `${labels[cat]} (${cat})` : cat;

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

  container.appendChild(metadataForm);
}

async function saveMetadata() {
  const saved = saveCurrentMetadata();
  if (!saved) {
    alert("Please fix errors before saving.");
    return;
  }

  // Fetch missing metadata if needed (all selected tables)
  const fetchPromises = [];
  for (const code of selectedTableDataMap.keys()) {
    if (!metadataFetchMap[code]) {
      fetchPromises.push(
        fetchWithRetry(`${BASE_URL}/${code}?geo=null`)
          .then((data) => {
            // Default selections if not manually configured
            const result = {
              label: data.label,
              updated: data.updated,
              description: data.extension?.description,
              dimension: data.dimension,
              dimensionPrefs: data.dimension,
            };

            metadataFetchMap[code] = result;
            selectedTableDataMap.set(code, result);
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

  localStorage.setItem(
    "selectedTables",
    JSON.stringify([...selectedTableDataMap.values()])
  );

  try {
    const res = await fetch("/save-metadata", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        updated: getEurostatFormatCurrentTime(),
        order: [...selectedTableDataMap.keys()],
        files: metadataFetchMap,
      }),
    });

    if (!res.ok) throw new Error("Failed to save metadata");

    const msg = await res.text();
    console.log(msg);
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
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
