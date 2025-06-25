console.log("localStorage", localStorage);

const NS = "urn:eu.europa.ec.eurostat.navtree";

let datasetMap = new Map();

if (localStorage && localStorage.selectedDatasets) {
  const datasets = JSON.parse(localStorage.selectedDatasets);
  console.log(datasets);
  for (let i = 0; i < datasets.length; i++) {
    datasetMap.set(datasets[i].code, datasets[i]);
  }
}

console.log("datasetMap", datasetMap);

fetch("/data/table_of_contents.xml")
  .then((response) => {
    if (!response.ok)
      throw new Error(`Failed to fetch XML: ${response.status}`);
    return response.text();
  })
  .then((xmlStr) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, "text/xml");

    const treeRoot = xmlDoc.documentElement;
    const topLevelBranches = Array.from(treeRoot.childNodes).filter(
      (node) =>
        node.nodeType === 1 &&
        node.localName === "branch" &&
        node.namespaceURI === NS
    );

    if (topLevelBranches.length === 0) {
      document.getElementById("table-of-contents").textContent =
        "No top-level branches found.";
      return;
    }

    const fullTreeData = topLevelBranches.map(parseBranch).filter(Boolean);
    const tree = renderTree(fullTreeData);

    // Set up initial view
    try {
      for (let i = 0; i < tree.children.length; ++i) {
        tree.children[i].firstChild.click();
      }
      const cct = tree.lastChild.lastChild;
      cct.firstChild.firstChild.click();
      const qol = cct.firstChild.lastChild;
      qol.firstChild.firstChild.click();
      const mlc = qol.firstChild.lastChild;
      mlc.firstChild.firstChild.click();
    } catch (err) {
      console.error("Error setting initial view:" + err.message);
    }

    // // Fetch existing metadata
    fetch("/data/metadata2.json")
      .then(response => response.json())
      .then(data => {
        console.log("Metadata2:", data);
        console.log(data.order.length);

        for (let file of data.order) {
          // Set flag on datasets
          data.files[file].isSaved = true;
          
          data.files[file].title = data.files[file].label;
          data.files[file].code = file;

          datasetMap.set(file, data.files[file]);
        }

        renderDatasets();
        document.getElementById("nextBtn").classList.remove("hidden");
      });

  })
  .catch((err) => {
    document.getElementById("table-of-contents").textContent =
      "Error loading tree: " + err.message;
    console.error(err);
  });

function renderTree(treeData) {
  const container = document.getElementById("table-of-contents");
  container.innerHTML = "";
  const tree = buildTreeHTML(treeData);
  if (!tree.children.length) {
    container.innerHTML = "No datasets found";
    return;
  }
  container.appendChild(tree);
  const topUl = container.children[0];
  topUl.style.border = "none";
  topUl.style.padding = 0;
  topUl.style.margin = 0;

  return tree;
}

function parseBranch(branchNode) {
  const title = getTagValue(branchNode, "title", "(untitled)");
  const code = getTagValue(branchNode, "code");
  const children = [];

  const childrenNode = branchNode.getElementsByTagNameNS(NS, "children")[0];
  if (childrenNode) {
    for (const node of childrenNode.childNodes) {
      if (node.nodeType !== 1) continue;

      // Currently eurovault can only display country-level data, not regional
      // TODO: maybe some datasets are slipping through this selection
      // https://ec.europa.eu/eurostat/web/nuts/overview
      const title = getTagValue(node, "title", "(untitled)");
      if (title.includes("NUTS")) continue;

      if (node.localName === "branch") {
        const childBranch = parseBranch(node);
        if (childBranch) {
          children.push(childBranch);
        }
      } else if (node.localName === "leaf") {
        children.push(parseLeaf(node));
      }
    }
  }

  if (children.length === 0) return null;

  return { type: "branch", title, code, children };
}

function parseLeaf(leafNode) {
  return {
    type: "leaf",
    title: getTagValue(leafNode, "title", "(untitled)"),
    code: getTagValue(leafNode, "code"),
    lastModified: getTagValue(leafNode, "lastModified"),
    shortDescription: getTagValue(leafNode, "shortDescription"),
    children: [],
  };
}

function getTagValue(parent, tagName, defaultValue = "") {
  const elements = parent.getElementsByTagNameNS(NS, tagName);
  for (let el of elements) {
    if (el.getAttribute("language") === "en" || !el.getAttribute("language")) {
      return el.textContent.trim();
    }
  }
  return defaultValue;
}

function buildTreeHTML(nodes) {
  const ul = document.createElement("ul");

  for (const node of nodes) {
    const li = document.createElement("li");

    if (node.type === "branch") {
      const span = document.createElement("span");
      span.textContent = "> " + node.title;
      span.classList.add("folder");
      span.dataset.expanded = "false";

      const childUl = buildTreeHTML(node.children);

      childUl.classList.add("hidden");

      span.onclick = () => {
        const expanded = span.dataset.expanded === "true";
        span.dataset.expanded = String(!expanded);
        span.textContent = (expanded ? "> " : "v ") + node.title;
        childUl.classList.toggle("hidden");

        if (!expanded) autoExpandIfSingle(li);
      };

      li.appendChild(span);
      li.appendChild(childUl);
      if (node.children.length > 0) {
        ul.appendChild(li);
      }
    } else if (node.type === "leaf") {
      const span = document.createElement("span");
      let displayTitle = `${node.title} (${node.code})`;
      span.textContent = displayTitle;
      span.classList.add("leaf");

      span.onclick = () => {
        if (!datasetMap.has(node.code)) {
          datasetMap.set(node.code, node);
          renderDatasets();
        }
      };
      li.appendChild(span);
      ul.appendChild(li);
    }
  }

  return ul;
}

function autoExpandIfSingle(folderLi) {
  const ul = folderLi.querySelector(":scope > ul");
  if (!ul || ul.children.length !== 1) return;

  const singleChild = ul.children[0];
  const folderToggle = singleChild.querySelector(":scope > .folder");
  const nestedUl = singleChild.querySelector(":scope > ul");

  if (folderToggle && nestedUl && nestedUl.classList.contains("hidden")) {
    folderToggle.dataset.expanded = "true";
    folderToggle.textContent = "v " + folderToggle.textContent.slice(2);
    nestedUl.classList.remove("hidden");

    autoExpandIfSingle(singleChild);
  }
}

function searchTreeDOM(term) {
  const rootUl = document.getElementById("table-of-contents").querySelector("ul");
  if (!rootUl) return;

  const found = searchAndToggle(rootUl, term.toLowerCase());
}

function searchAndToggle(ulElement, searchTerm) {
  let hasMatch = false;
  for (const li of ulElement.children) {
    const span = li.querySelector(":scope > .folder, :scope > .leaf");
    const isLeaf = span.classList.contains("leaf");

    let match = false;

    if (isLeaf) {
      const text = span.textContent.toLowerCase();
      if (searchTerm && searchTerm.length >= 3 && text.includes(searchTerm)) {
        match = true;
        span.innerHTML = span.textContent.replace(
          new RegExp(`(${searchTerm})`, "ig"),
          `<span class="highlight">$1</span>`
        );
      } else {
        span.innerHTML = span.textContent; // remove previous highlight
      }
    } else {
      span.innerHTML = span.textContent; // cleanup
    }

    const childUl = li.querySelector(":scope > ul");
    let childMatch = false;
    if (childUl) {
      childMatch = searchAndToggle(childUl, searchTerm);
      if (childMatch) {
        childUl.classList.remove("hidden");
        span.dataset.expanded = "true";
        span.textContent = "v " + span.textContent.slice(2);
      } else {
        childUl.classList.add("hidden");
        span.dataset.expanded = "false";
        span.textContent = "> " + span.textContent.slice(2);
      }
    }
    // Hide non-matching nodes
    // li.style.display = match || childMatch ? "" : "none";
    if (match || childMatch) hasMatch = true;
  }
  return hasMatch;
}

document.getElementById("searchBox").addEventListener("input", (e) => {
  const searchTerm = e.target.value.trim();
  searchTreeDOM(searchTerm.length >= 3 ? searchTerm : "");
});

document.getElementById("nextBtn").onclick = () => {
  // Save data to localStorage
  localStorage.setItem(
    "selectedDatasets",
    JSON.stringify([...datasetMap.values()])
  );
  localStorage.setItem("step", "2");
  window.location.reload(); // reload index.html and load step2
};

document.getElementById("backBtn").onclick = () => {
  window.location.href = "/"; // go to map
};

// Dataset table logic

let draggingEl = null;
let startIndex = null;
let isDragging = false;
let selectedIndex = null;

function renderDatasets() {
  const tbody = document.querySelector("#dataset-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const data = [...datasetMap.values()];

  data.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.code = item.code;

    if (item.isSaved) {
      tr.classList.add("saved");
    }

    const eurostatLink = `https://ec.europa.eu/eurostat/databrowser/view/${item.code}/default/table?lang=en`;

    tr.innerHTML = `
      <td title="Drag and drop">${index + 1}</td>
      <td title="Drag and drop">${item.title} (${item.code})</td>
      <td><a class="link-database" href="${eurostatLink}" title="Open dataset" target="_blank" style="margin-right:10px">&#x1F517;</a><a href="#" title="Delete row" class="link-remove">&#x274C;</a></td>
    `;

    if (index === selectedIndex) {
      tr.classList.add("selected-row");
    }

    // Drag logic
    addDragEvents(tr);

    // Remove button
    tr.querySelector("a.link-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      datasetMap.delete(item.code);
      renderDatasets();
    });

    tbody.appendChild(tr);
  });
}

function addDragEvents(row) {
  row.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("a")) return;

    // Remove .selected-row from all rows

  const tbody = document.querySelector("#dataset-table tbody");
    tbody
      .querySelectorAll("tr.selected-row")
      .forEach((r) => r.classList.remove("selected-row"));

    draggingEl = row;
    startIndex = [...row.parentNode.children].indexOf(row);
    draggingEl.classList.add("dragged");
    isDragging = true;
    document.querySelector("#dataset-table").classList.add("dragging");

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

function onMouseMove(e) {
  const tbody = document.querySelector("#dataset-table tbody");
  if (!draggingEl) return;

  const mouseY = e.clientY;
  let inserted = false;

  for (let row of tbody.children) {
    if (row === draggingEl) continue;

    const rect = row.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    if (mouseY < midpoint) {
      tbody.insertBefore(draggingEl, row);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    tbody.appendChild(draggingEl);
  }
}

function onMouseUp(e) {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  document.querySelector("#dataset-table").classList.remove("dragging");

  if (!isDragging) return;
  isDragging = false;

  const tbody = document.querySelector("#dataset-table tbody");

  const dropInsideTable = tbody.contains(e.target);
  if (!dropInsideTable) {
    selectedIndex = startIndex;
    renderDatasets();
    return;
  }

  const rows = [...tbody.children];
  const newOrder = [];

  for (let row of rows) {
    const code = row.dataset.code;
    const item = datasetMap.get(code);
    if (item) newOrder.push([code, item]);
  }

  selectedIndex = rows.indexOf(draggingEl);

  datasetMap = new Map(newOrder);
  renderDatasets();

  draggingEl = null;
}