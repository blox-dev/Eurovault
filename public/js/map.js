"use strict";

import { showCountryChart, showLineChart } from "./chart.js";
import { fetchMetadata } from "./dataLoader.js";
import { mapContainer, chartContainer } from "./main.js";
import { state } from "./state.js";

export let europe;

let width, height;
let svg, projection, pathGenerator;

export function resizeMap() {
  const bounds = mapContainer.node().getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  projection.fitSize([width, height], europe);
  svg.selectAll("path").attr("d", pathGenerator); // Reapply path with new projection
}

export function fetchMapData() {
  svg = mapContainer
    .append("svg")
    .attr("id", "map-svg")
    .attr("width", "100%")
    .attr("height", "100%");

  // Add a group for the map
  const g = svg.append("g");
  projection = d3.geoMercator();
  pathGenerator = d3.geoPath().projection(projection);

  fetch("/public/geojson/CNTR_RG_60M_2024_4326_min.geojson")
    .then((res) => res.json())
    .then((geoJSON) => {
      europe = geoJSON;
      resizeMap();

      g.selectAll("path")
        .data(europe.features)
        .enter()
        .append("path")
        .attr("d", pathGenerator)
        .attr("fill", "#cccccc")
        .attr("stroke", "#333")
        .attr("stroke-width", 0.25);

      let mapTooltip = d3.select("#map-tooltip");
      const zoom = d3
        .zoom()
        .scaleExtent([1, 10])
        .translateExtent([
          [-200, -200],
          [width + 200, height + 200],
        ]);

      // only on desktop
      if (window.innerWidth > 768) {
        zoom.on("zoom", (event) => g.attr("transform", event.transform));
        g.selectAll("path").on("click", handleMapPathClick);
      } else {
        zoom.on("zoom", (event) => {
          g.attr("transform", event.transform);
          mapTooltip.style("display", "none");
        });
      }
      svg.call(zoom);
      fetchMetadata();
    })
    .catch((error) => {
      console.error("Error fetching europe.geojson:", error);
    });
}

export function handleMapPathClick(event, d) {
  const geoCode = d.properties.CNTR_ID;

  if (event.shiftKey) {
    if (
      state.chartedCountries.has(geoCode) &&
      state.chartedCountries.size > 1
    ) {
      state.chartedCountries.delete(geoCode);
    } else if (state.chartedCountries.size < 10) {
      state.chartedCountries.add(geoCode);
    }

    if (
      chartContainer.attr("data-chart-type") !== "line" &&
      state.currentSelected &&
      !state.chartedCountries.has(state.currentSelected)
    ) {
      state.chartedCountries.add(state.currentSelected);
    }

    if (state.chartedCountries.size > 0) {
      showLineChart(Array.from(state.chartedCountries));
    } else {
      chartContainer.html("");
    }
  } else {
    // Normal click reset chartedCountries
    state.chartedCountries.clear();
    state.currentSelected = geoCode;
    showCountryChart(geoCode);
  }
}
