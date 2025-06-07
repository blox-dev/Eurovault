"use strict";

import { showCountryChart, showLineChart } from "./chart.js";
import { colorPalette, mapContainer, chartContainer } from "./main.js";
import { resizeMap, handleMapPathClick } from "./map.js";
import { state } from "./state.js";
import { compareTimes, shorten } from "./utils.js";

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

  // edit-metadata-button
  document.getElementById("edit-metadata-button").onclick = (event) => {
    if (!localStorage) {
      return;
    }
    localStorage.removeItem("selectedTables");
    localStorage.setItem("step", 1);
    window.location.href = "/metadata";
  };

  function updateFilters(dataset) {
    const groupsToRemove = filterPanel.querySelectorAll(".control-group");

    groupsToRemove.forEach((group) => {
      filterPanel.removeChild(group);
    });

    state.selectedDataset = dataset;

    // const values = state.metadata[state.selectedDataset].values || {};
    const values = state.metadata[state.selectedDataset].dimensionPrefs || {};

    // Create dropdowns for each param
    Object.keys(values).forEach((param) => {
      if (param === "time") {
        return;
      }
      const groupDiv = document.createElement("div");
      groupDiv.classList.add("control-group");

      const label = document.createElement("label");
      label.textContent = values[param].label;

      const select = document.createElement("select");
      select.id = `filter-${param}`;

      const options = Object.keys(values[param].category.label);
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = values[param].category.label[opt];
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

      if (options.length <= 1) {
        select.disabled = true;
        filterPanel.append(groupDiv);
      } else {
        filterPanel.prepend(groupDiv);
      }
    });

    // Initial filtering
    filterData(state.selectedDataset);
  }
}

function filterData(selectedDataset, nochange = false) {
  let data = state.datasets[selectedDataset];

  // const values = state.metadata[state.selectedDataset].values || {};
  const values = state.metadata[state.selectedDataset].dimensionPrefs || {};
  let filters = {};

  // Gather selected filters
  Object.keys(values).forEach((param) => {
    // store unit of measure
    if (param === "unit") {
      const selected = document.getElementById(`filter-${param}`).value;
      state.ylabel = values.unit.category.label[selected];
    }

    // store unit of time
    if (param === "time") {
      // Take any element from the time category, as they share the same structure
      const selected = Object.keys(values.time.category.label)[0];
      if (selected.indexOf("Q") !== -1) {
        state.xlabel = "Quarter";
        return;
      } else if (selected.indexOf("S") !== -1) {
        state.xlabel = "Season";
        return;
      } else if (selected.indexOf("-") !== -1) {
        state.xlabel = "Month";
        return;
      }
      state.xlabel = "Year";
      return;
    }

    // Ignore filters with one option
    if (Object.keys(values[param].category.index).length === 1) {
      return;
    }

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
  const scale = d3.scaleQuantile().domain(nonZeroValues).range(colorPalette);

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

  // Set title and label
  d3.select("#info-label").text(label);

  // Handle description panel
  const descPanel = d3.select("#info-description");
  descPanel.html(""); // Clear old
  descPanel.classed("hidden", true); // Hide by default
  const helpIcon = d3.select("#info-help");

  if (description) {
    descPanel.text(description);

    helpIcon
      .on("mouseenter", () => descPanel.classed("hidden", false))
      .on("mouseleave", () => descPanel.classed("hidden", true))
      .classed("hidden", false)
      .classed("inline-block", true);
  } else {
    helpIcon.classed("hidden", true).classed("inline-block", false);
  }

  // 7. Update color legend
  const legend = d3.select("#color-legend").html("");
  const thresholds = scale.quantiles();
  const unit = shorten(state.ylabel) || "";

  const allThresholds = [
    d3.min(nonZeroValues),
    ...thresholds,
    d3.max(nonZeroValues),
  ];

  allThresholds.forEach((val, i) => {
    if (i === allThresholds.length - 1) return; // Skip last point (no range to next)

    const from = allThresholds[i];
    const to = allThresholds[i + 1];
    const color = colorPalette[i];
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
      <div>${unit ? `${label} ${unit}` : label}</div>
    `);
  });

  // Add grey color for zero/missing
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

// Handle resize

window.addEventListener("resize", () => {
  resizeMap();

  const svg = d3.select("#map-svg");

  if (window.innerWidth <= 768) {
    svg.selectAll("path").on("click", null);
    return;
  }

  svg.selectAll("path").on("click", handleMapPathClick);

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
});
