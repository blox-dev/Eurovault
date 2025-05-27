"use strict";

import { showCountryChart, showLineChart } from "./chart.js";
import { colorPalette, mapContainer, chartContainer } from "./main.js";
import { state } from "./state.js";
import { compareTimes } from "./utils.js";

export function setupControls(datasetKeys) {
  const datasetSelect = document.getElementById("dataset-select");
  const filterPanel = document.getElementById("filter-panel");

  // Populate dataset dropdown
  datasetKeys.forEach((key, index) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = state.metadata[key].label;
    datasetSelect.appendChild(option);
  });

  datasetSelect.value = datasetKeys[0];
  updateFilters(datasetKeys[0]);

  datasetSelect.addEventListener("change", (e) => {
    for (const key in state.timeColorCache) {
      delete state.timeColorCache[key];
    }
    updateFilters(e.target.value);
  });

  function updateFilters(dataset) {
    const groupsToRemove = filterPanel.querySelectorAll(".control-group");

    groupsToRemove.forEach((group) => {
      filterPanel.removeChild(group);
    });

    state.selectedDataset = dataset;

    const values = state.metadata[state.selectedDataset].values || {};

    // Create dropdowns for each param
    Object.keys(values).forEach((param) => {
      const groupDiv = document.createElement("div");
      groupDiv.classList.add("control-group");

      const label = document.createElement("label");
      label.textContent = param;

      const select = document.createElement("select");
      select.id = `filter-${param}`;

      const options = Object.keys(values[param]);
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = values[param][opt];
        select.appendChild(option);
      });

      select.value = options[0];

      // Add change event
      select.addEventListener("change", () => {
        for (const key in state.timeColorCache) {
          delete state.timeColorCache[key];
        }
        filterData(state.selectedDataset, true);
      });

      groupDiv.appendChild(label);
      groupDiv.appendChild(select);
      filterPanel.appendChild(groupDiv);
    });

    // Initial filtering
    filterData(state.selectedDataset);
  }
}

function filterData(selectedDataset, nochange = false) {
  let data = state.datasets[selectedDataset];

  const values = state.metadata[state.selectedDataset].values || {};
  let filters = {};

  // Gather selected filters
  Object.keys(values).forEach((param) => {
    const selected = document.getElementById(`filter-${param}`).value;
    filters[param.toUpperCase()] = selected; // CSV uses uppercase column names
  });

  // Filter the dataset
  state.filteredData = data.filter((row) => {
    return Object.keys(filters).every((param) => {
      return row[param] === filters[param];
    });
  });

  // console.log(`Filtered dataset for ${selectedDataset}:`, filteredData);
  updateMapColors(null, nochange);

  if (window.innerWidth <= 768) {
    return;
  }

  const chartType = chartContainer.attr("data-chart-type");
  if (chartType) {
    if (chartType == "bar") {
      const geoCode = state.currentSelected;
      if (geoCode) {
        showCountryChart(geoCode);
      }
    } else if (chartType == "line") {
      showLineChart(Array.from(state.chartedCountries));
    }
  }
}

function updateMapColors(selectedTime = null, nochange = false) {
  const timeChanged = selectedTime === null;
  // 1. Check if TIME column exists
  const hasTime =
    state.filteredData.length > 0 && "TIME" in state.filteredData[0];

  // 2. If so, find the latest year
  let latestTime = selectedTime;
  if (!selectedTime && hasTime) {
    let times = [...new Set(state.filteredData.map((d) => d.TIME))];
    times.sort(compareTimes);
    latestTime = times[times.length - 1];
  }

  let valuesByGeo = state.timeColorCache[latestTime];
  if (!valuesByGeo) {
    valuesByGeo = {};
    state.filteredData.forEach((row) => {
      const geo = row.GEO;
      if (!geo) return;
      if (!hasTime || row.TIME === latestTime) {
        const val = parseFloat(row.VALUE);
        valuesByGeo[geo] = val;
      }
    });
    state.timeColorCache[latestTime] = valuesByGeo;
  }

  // 4. Compute min/max ignoring zeros
  const nonZeroValues = Object.values(valuesByGeo).filter((v) => v > 0);
  const minVal = d3.min(nonZeroValues);
  const maxVal = d3.max(nonZeroValues);

  const scale = d3.scaleQuantize().domain([minVal, maxVal]).range(colorPalette);

  // 5. Re-color the countries
  mapContainer
    .selectAll("path")
    .transition()
    .duration(200)
    .attr("fill", function (d) {
      if (!d || !d.properties) {
        console.error(d, this);
        return;
      }
      const geoCode = d.properties.EUROSTAT;
      const val = valuesByGeo[geoCode] ?? 0;

      if (val === 0 || isNaN(val)) return "#cccccc"; // Grey for 0/missing
      return scale(val);
    });

  mapContainer
    .selectAll("path")
    .on("mouseover", function (event, d) {
      d3.select(this).raise().style("stroke-width", 0.5);
      const geoCode = d.properties.EUROSTAT;
      const countryName = d.properties.ADMIN;
      const val = valuesByGeo[geoCode] ?? 0;

      const tooltip = d3.select("#map-tooltip");
      tooltip
        .style("display", "block")
        .html(`<strong>${countryName}</strong><br/>Value: ${val || "0"}`);
    })
    .on("touchstart", function (event, d) {
      d3.select(this).raise().style("stroke-width", 0.5);
      const geoCode = d.properties.EUROSTAT;
      const countryName = d.properties.ADMIN;
      const val = valuesByGeo[geoCode] ?? 0;

      const tooltip = d3.select("#map-tooltip");
      tooltip
        .style("display", "block")
        .html(`<strong>${countryName}</strong><br/>Value: ${val || "0"}`);
    })
    .on("mousemove", function (event) {
      d3.select("#map-tooltip")
        .style("left", event.pageX + "px")
        .style("top", event.pageY - 40 + "px");
    })
    .on("mouseout", function () {
      d3.select(this).style("stroke-width", 0.25);
      d3.select("#map-tooltip").style("display", "none");
    });

  // 6. Update info panel
  const dataset = document.getElementById("dataset-select").value;
  const meta = state.metadata[dataset];
  const label = meta.label || dataset;
  const description = meta.description || "";
  const shouldShowDescription = description && description !== label;

  d3.select("#info-title").text(label);
  const descContainer = d3.select("#info-description");
  descContainer.html(""); // Clear old

  if (shouldShowDescription) {
    const isLong = description.length > 100;
    const shortText = description.slice(0, 100) + "...";

    descContainer
      .append("span")
      .attr("id", "desc-text")
      .text(isLong ? shortText : description);

    if (isLong) {
      descContainer
        .append("a")
        .attr("href", "#")
        .attr("id", "desc-toggle")
        .style("display", "block")
        .style("color", "#0077cc")
        .style("margin-top", "4px")
        .text("Read more...");

      // Toggle behavior
      d3.select("#desc-toggle").on("click", function (event) {
        event.preventDefault();
        const current = d3.select("#desc-text").text();
        const isExpanded = current === description;

        d3.select("#desc-text").text(isExpanded ? shortText : description);
        d3.select(this).text(isExpanded ? "Read more..." : "Read less...");
      });
    }
  }

  // 7. Update color legend
  const legend = d3.select("#color-legend");
  legend.html(""); // Clear previous

  const thresholds = scale.thresholds
    ? scale.thresholds()
    : scale.range().map((_, i, arr) => {
        const step = (maxVal - minVal) / arr.length;
        return minVal + step * i;
      });

  thresholds.forEach((t, i) => {
    const color = colorPalette[i];
    const from = i === 0 ? minVal : thresholds[i - 1];
    const to = t;
    const label =
      from.toFixed(0) === to.toFixed(0)
        ? `${from.toFixed(2)}-${to.toFixed(2)}`
        : `${from.toFixed(0)}-${to.toFixed(0)}`;
    legend
      .append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("margin-bottom", "2px").html(`
              <div style="width: 18px; height: 14px; background:${color}; margin-right:6px;"></div>
              <div>${label}</div>
            `);
  });

  legend
    .append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("margin-top", "6px")
    .html(
      `<div style="width: 18px; height: 14px; background:#cccccc; margin-right:6px;"></div><div>No data / 0</div>`
    );

  // Update Time Slider
  let sliderContainer = d3.select("#time-slider-container");

  if (nochange) {
    return;
  }
  if (!timeChanged) {
    d3.select("#slider-text-div").text(`Showing data for: ${selectedTime}`);
    return;
  }
  sliderContainer.html(""); // Clear existing content

  if (hasTime) {
    let times = [...new Set(state.filteredData.map((d) => d.TIME))];
    times.sort(compareTimes);

    sliderContainer
      .append("input")
      .attr("type", "range")
      .attr("min", 0)
      .attr("max", times.length - 1)
      .attr("value", times.length - 1)
      .style("width", "100%")
      .on("input", function () {
        const index = +this.value;
        const selectedTime = times[index];
        updateMapColors(selectedTime);
      });

    sliderContainer
      .append("div")
      .attr("id", "slider-text-div")
      .style("text-align", "center")
      .style("font-size", "0.8rem")
      .style("margin-top", "4px")
      .text(`Showing data for: ${selectedTime ? selectedTime : latestTime}`);
  }
}
