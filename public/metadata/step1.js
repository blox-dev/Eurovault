console.log("localStorage", localStorage);

const NS = "urn:eu.europa.ec.eurostat.navtree";

let selectedTableDataMap = new Map();

if (localStorage && localStorage.selectedTables) {
  const tables = JSON.parse(localStorage.selectedTables);
  console.log(tables);
  for (let i = 0; i < tables.length; i++) {
    selectedTableDataMap.set(tables[i].code, tables[i]);
  }
}

console.log("selectedTableDataMap", selectedTableDataMap)

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
      document.getElementById("treeContainer").textContent =
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
        console.log(Object.keys(data.files).length);

        for (let file of Object.keys(data.files)) {
          // Set flag on metadata tables
          data.files[file].isSaved = true;
          
          data.files[file].title = data.files[file].label;
          data.files[file].code = file;

          selectedTableDataMap.set(file, data.files[file]);
        }

        renderSelectedTables();
        document.getElementById("nextBtn").classList.remove("hidden");
      });

  })
  .catch((err) => {
    document.getElementById("treeContainer").textContent =
      "Error loading tree: " + err.message;
    console.error(err);
  });

function renderTree(treeData) {
  const container = document.getElementById("treeContainer");
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
      // TODO: maybe some tables are slipping through this selection
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
        if (!selectedTableDataMap.has(node.code)) {
          selectedTableDataMap.set(node.code, node);
          renderSelectedTables();
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
  const rootUl = document.getElementById("treeContainer").querySelector("ul");
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

function renderSelectedTables() {
  const container = document.getElementById("selected-tables");
  container.innerHTML = "";

  selectedTableDataMap.keys().forEach((code) => {
    const node = selectedTableDataMap.get(code);
    const p = document.createElement("p");

    const text = document.createElement("span");
    text.textContent = `${node.title} (${node.code})`;
    p.appendChild(text);

    // Eurostat link icon
    const linkIcon = document.createElement("a");
    linkIcon.href = `https://ec.europa.eu/eurostat/databrowser/view/${node.code}/default/table?lang=en`;
    linkIcon.target = "_blank";
    linkIcon.style.marginLeft = "10px";
    linkIcon.style.textDecoration = "none";
    linkIcon.textContent = "🔗";
    p.appendChild(linkIcon);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.style.marginLeft = "10px";
    removeBtn.onclick = () => {
      selectedTableDataMap.delete(code);
      renderSelectedTables();
    };
    p.appendChild(removeBtn);

    // Mark saved tables
    if (node.isSaved) {
      p.style.color = "red";
    }
    container.appendChild(p);
  });
}

document.getElementById("searchBox").addEventListener("input", (e) => {
  const searchTerm = e.target.value.trim();
  searchTreeDOM(searchTerm.length >= 3 ? searchTerm : "");
});

document.getElementById("nextBtn").onclick = () => {
  // Save data to localStorage
  localStorage.setItem(
    "selectedTables",
    JSON.stringify([...selectedTableDataMap.values()])
  );
  localStorage.setItem("step", "2");
  window.location.reload(); // reload index.html and load step2
};

document.getElementById("backBtn").onclick = () => {
  window.location.href = "/"; // go to map
};
