"use strict";

import { setupControls } from "./controls.js";
import { state } from "./state.js";

export function fetchMetadata() {
  fetch("/data/metadata.json")
    .then((res) => res.json())
    .then((data) => {
      state.metadata = {}; // store metadata in global variable

      for (let file of data.files) {
        if (file._status?.data?.status !== "success") {
          // do not display incomplete data
          continue;
        }
        state.metadata[file.code] = file;
      }

      // get all the dataset keys (e.g., 'SDG_08_10', 'EDUC_UOE_MOBS04', etc.)
      const datasetKeys = Object.keys(state.metadata);
      const firstKey = datasetKeys[0];

      // load only the first dataset
      d3.csv(`/data/files/${firstKey}.csv`)
        .then((csv) => {
          state.datasets[firstKey] = csv;
          setupControls(datasetKeys, "init");
        })
        .catch((error) => {
          console.error(`Error loading CSV for ${firstKey}:`, error);
        });
    })
    .catch((error) => {
      console.error("Error fetching metadata:", error);
    });
}
