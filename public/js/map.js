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

  fetch("/public/europe.geojson")
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

      // only on desktop
      if (window.innerWidth > 768) {
        g.selectAll("path").on("click", handleMapPathClick);
      }
      svg.call(
        d3
          .zoom()
          .scaleExtent([1, 10])
          .translateExtent([
            [-100, -100],
            [width + 100, height + 100],
          ])
          .on("zoom", (event) => g.attr("transform", event.transform))
      );
      fetchMetadata();
    })
    .catch((error) => {
      console.error("Error fetching europe.geojson:", error);
    });
}

export function handleMapPathClick(event, d) {
  const geoCode = d.properties.EUROSTAT;

  if (event.shiftKey) {
    if (
      state.chartedCountries.has(geoCode) &&
      state.chartedCountries.size > 1
    ) {
      state.chartedCountries.delete(geoCode);
    } else {
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
