"use strict";

import { setupControls } from "./controls.js";
import { state } from "./state.js";

export function fetchMetadata() {
  fetch("/data/metadata2.json")
    .then((res) => res.json())
    .then((data) => {
      state.metadata = data.files; // Store metadata in global variable
      
      // Get all the dataset keys (e.g., 'SDG_08_10', 'EDUC_UOE_MOBS04', etc.)
      const datasetKeys = Object.keys(state.metadata);
      
      // For each key, load the corresponding CSV file
      const csvPromises = datasetKeys.map((key) =>
        d3
          .csv(`/data/files/${key}.csv`)
          .then((csv) => (state.datasets[key] = csv)) // Store loaded CSV data into global datasets object
          .catch((error) => {
            console.error(`Error loading CSV for ${key}:`, error);
          })
      );

      Promise.all(csvPromises).then(() => {
        console.log("All CSVs loaded:", state.datasets);
        setupControls(datasetKeys);
      });
    })
    .catch((error) => {
      console.error("Error fetching metadata:", error);
    });
}
