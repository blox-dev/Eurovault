"use strict";

import { fetchMapData } from "./map.js";
import { state } from "./state.js";

// Permanent DOM elements
export const mainContainer = d3.select("#main-container");
export const mapContainer = d3.select("#map-container");
export const controlsContainer = d3.select("#controls-container");
export const chartContainer = d3.select("#chart-container");

export const colorPalette = d3.schemeBlues[6]; // 6-step blue

window.onload = function () {
  window.eurovault = {};
  window.eurovault.state = state;
  fetchMapData();
};
