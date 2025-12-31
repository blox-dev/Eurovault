"use strict";

import { showCountryChart, showLineChart } from "./chart.js";
import { colorPalette, mapContainer, chartContainer } from "./main.js";
import { resizeMap, handleMapPathClick } from "./map.js";
import { state } from "./state.js";
import { compareTimes, shorten } from "./utils.js";

export function setupControls(datasetKeys, updateSource = null) {
  const datasetSelect = document.getElementById("dataset-select");
  const filterPanel = document.getElementById("filter-panel");

  // populate dataset dropdown
  datasetKeys.forEach((key, index) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = state.metadata[key].label;
    datasetSelect.appendChild(option);
  });

  datasetSelect.value = datasetKeys[0];
  updateFilters(datasetKeys[0], updateSource);

  datasetSelect.addEventListener("change", (e) => {
    for (const key in state.timeColorCache) {
      delete state.timeColorCache[key];
    }
    const slider = document.querySelector(
      "#time-slider-container input[type=range]"
    );
    const selectedTime = slider ? state.times[+slider.value] : null;
    const selectedKey = e.target.value;

  // if already loaded, just update filters
  if (state.datasets[selectedKey]) {
    updateFilters(selectedKey, "dataset", selectedTime);
  } else {
    // load new CSV
    d3.csv(`/data/files/${selectedKey}.csv`)
      .then((csv) => {
        // clear old dataset(s)
        for (const key in state.datasets) {
          delete state.datasets[key];
        }

        state.datasets[selectedKey] = csv;

        updateFilters(selectedKey, "dataset", selectedTime);
      })
      .catch((error) => {
        console.error(`Error loading CSV for ${selectedKey}:`, error);
      });
  }
  });

  document.getElementById("edit-metadata-button").onclick = (event) => {
    if (!localStorage) {
      return;
    }
    localStorage.removeItem("selectedTables");
    localStorage.setItem("step", 1);
    window.location.href = "/metadata";
  };

  function updateFilters(dataset, updateSource = null, selectedTime = null) {
    const groupsToRemove = filterPanel.querySelectorAll(".control-group");

    groupsToRemove.forEach((group) => {
      filterPanel.removeChild(group);
    });

    state.selectedDataset = dataset;

    // const values = state.metadata[state.selectedDataset].values || {};
    const values = state.metadata[state.selectedDataset].dimensionPrefs || {};

    // create dropdowns for each param
    Object.keys(values).forEach((param) => {
      if (param === "time") {
        return;
      }
      const groupDiv = document.createElement("div");
      groupDiv.classList.add("control-group");

      const label = document.createElement("label");
      label.textContent = values[param].label;
      label.htmlFor = `filter-${param}`;

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

      select.addEventListener("change", () => {
        for (const key in state.timeColorCache) {
          delete state.timeColorCache[key];
        }
        const slider = document.querySelector(
          "#time-slider-container input[type=range]"
        );
        const selectedTime = slider ? state.times[+slider.value] : null;

        filterData(state.selectedDataset, "filter", selectedTime);
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

    // initial filtering
    filterData(state.selectedDataset, updateSource, selectedTime);
  }
}

function filterData(selectedDataset, updateSource = null, selectedTime = null) {
  let data = state.datasets[selectedDataset];

  // const values = state.metadata[state.selectedDataset].values || {};
  const values = state.metadata[state.selectedDataset].dimensionPrefs || {};
  let filters = {};

  // gather selected filters
  Object.keys(values).forEach((param) => {
    // store unit of measure
    if (param === "unit") {
      const selected = document.getElementById(`filter-${param}`).value;
      state.ylabel = values.unit.category.label[selected];
    }

    // store unit of time
    if (param === "time") {
      // take any element from the time category, as they share the same structure
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

    // ignore filters with one option
    if (Object.keys(values[param].category.index).length === 1) {
      return;
    }

    const selected = document.getElementById(`filter-${param}`).value;
    filters[param.toUpperCase()] = selected; // CSV uses uppercase column names
  });

  // filter the dataset
  state.filteredData = data.filter((row) => {
    return Object.keys(filters).every((param) => {
      return row[param] === filters[param];
    });
  });

  // console.log(`Filtered dataset for ${selectedDataset}:`, filteredData);
  updateMapColors(updateSource, selectedTime);

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

function findClosestTimeMatch(selectedTime, availableTimes, timeMatchLevel) {
  if (!selectedTime || !availableTimes || availableTimes.length === 0)
    return null;

  // exact match
  if (availableTimes.includes(selectedTime)) return selectedTime;

  if (timeMatchLevel === "strict") return null;

  // extract year
  const yearMatch = selectedTime.match(/^\d{4}/);
  const year = yearMatch ? yearMatch[0] : null;

  if (year) {
    const sameYearMatches = availableTimes.filter((t) => t.startsWith(year));
    if (sameYearMatches.length > 0) {
      return sameYearMatches[0]; // return first match in same year
    }
  }

  // start with selectedTime (e.g., "2023" matches "2023-Q2")
  const prefixMatches = availableTimes.filter((t) =>
    t.startsWith(selectedTime)
  );
  if (prefixMatches.length > 0) return prefixMatches[0];

  // end with selectedTime (e.g., "Q2" matches "2023-Q2")
  const suffixMatches = availableTimes.filter((t) => t.endsWith(selectedTime));
  if (suffixMatches.length > 0) return suffixMatches[0];

  // loose match
  const looseMatches = availableTimes.filter((t) => t.includes(selectedTime));
  if (looseMatches.length > 0) return looseMatches[0];

  return null;
}

function updateMapColors(updateSource = null, selectedTime = null) {
  if (!["dataset", "filter", "timeSlider", "external", "init"].includes(updateSource)) {
    throw new Error(`Unknown update source: ${updateSource}`);
  }

  const timeMatchLevel = state.timeMatchLevel;

  // console.log("updateSource", updateSource);

  let times = [...new Set(state.filteredData.map((d) => d.TIME))];
  times.sort(compareTimes);
  state.times = times;

  // update the time to be selected based on updateSource and timeMatchLevel
  let matchedTime = null;

  if (timeMatchLevel === "none" && ["dataset", "filter"].includes(updateSource)) {
      selectedTime = null;
  } else {
    matchedTime = findClosestTimeMatch(selectedTime, times, timeMatchLevel);
  }

  // find closest time to match with, or default with the latest time
  selectedTime = matchedTime || times[times.length - 1];

  let valuesByGeo = state.timeColorCache[selectedTime];
  if (!valuesByGeo) {
    valuesByGeo = {};
    state.filteredData.forEach((row) => {
      const geo = row.GEO;
      if (!geo) return;
      if (row.TIME === selectedTime) {
        const val = parseFloat(row.VALUE);
        valuesByGeo[geo] = val;
      }
    });
    state.timeColorCache[selectedTime] = valuesByGeo;
  }

  // compute min/max ignoring zeros
  const nonZeroValues = Object.values(valuesByGeo).filter((v) => v > 0);
  const scale = d3.scaleQuantile().domain(nonZeroValues).range(colorPalette);

  // recolor the countries
  mapContainer
    .selectAll("path")
    .transition()
    .duration(200)
    .attr("fill", function (d) {
      if (!d || !d.properties) {
        console.error(d, this);
        return;
      }
      const geoCode = d.properties.CNTR_ID;
      const val = valuesByGeo[geoCode] ?? 0;

      if (val === 0 || isNaN(val)) return "#cccccc"; // grey for 0/missing
      return scale(val);
    });

  mapContainer
    .selectAll("path")
    .on("mouseover", function (event, d) {
      d3.select(this).raise().style("stroke-width", 0.5);
      const geoCode = d.properties.CNTR_ID;
      const countryName = d.properties.NAME_ENGL;
      const val = valuesByGeo[geoCode] ?? 0;

      const tooltip = d3.select("#map-tooltip");
      tooltip
        .style("display", "block")
        .html(`<strong>${countryName}</strong><br/>Value: ${val || "0"}`);
    })
    .on("touchstart", function (event, d) {
      d3.select(this).raise().style("stroke-width", 0.5);
      const geoCode = d.properties.CNTR_ID;
      const countryName = d.properties.NAME_ENGL;
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

  // update info panel
  const dataset = document.getElementById("dataset-select").value;
  const meta = state.metadata[dataset];
  const label = meta.label || dataset;
  const description = meta.description || "";

  // set title and label
  d3.select("#info-label").text(label);

  // handle description panel
  const descPanel = d3.select("#info-description");
  descPanel.html("");
  descPanel.classed("hidden", true); // hide by default
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

  // update color legend
  const legend = d3.select("#color-legend").html("");

  if(!state.filteredData.length) {
    // no reason to display data-specific information
    // when there is no data
    return;
  }

  const thresholds = scale.quantiles();
  const unit = shorten(state.ylabel) || "";

  const allThresholds = [
    d3.min(nonZeroValues),
    ...thresholds,
    d3.max(nonZeroValues),
  ];

  allThresholds.forEach((val, i) => {
    if (i === allThresholds.length - 1) return; // skip last point (no range to next)

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

  // add grey color for zero/missing
  legend
    .append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("margin-top", "6px")
    .html(
      `<div style="width: 18px; height: 14px; background:#cccccc; margin-right:6px;"></div><div>No data / 0</div>`
    );

  // update time slider
  if (updateSource === "timeSlider") {
    d3.select("#slider-text-div").text(`Showing data for: ${selectedTime}`);
    return;
  }

  let sliderContainer = d3.select("#time-slider-container");
  sliderContainer.html("");

  if (times.length > 1) {
    const selectedIndex = times.indexOf(selectedTime);

    sliderContainer
      .append("input")
      .attr("type", "range")
      .attr("min", 0)
      .attr("max", times.length - 1)
      .attr("value", selectedIndex)
      .style("width", "100%")
      .on("input", function () {
        const index = +this.value;
        const newTime = times[index];
        updateMapColors("timeSlider", newTime);
      });

    sliderContainer
      .append("div")
      .attr("id", "slider-text-div")
      .style("text-align", "center")
      .style("font-size", "0.8rem")
      .style("margin-top", "4px")
      .text(`Showing data for: ${selectedTime}`);
  }
}

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
