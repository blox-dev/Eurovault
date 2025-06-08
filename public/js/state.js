const VALID_TIME_MATCH_LEVELS = [
  "none", // does not attempt time matching
  "strict", // only matches exact string
  "smart", // matches approximate terms, e.g. 2023-04 = 2023 = 2023-Q1 = 2023-S1
];

export let state = {
  datasets: {}, // Global object to store all datasets
  metadata: {}, // Global object to store all metadata
  filteredData: [], // Current filtered dataset
  selectedDataset: null, // Current metadata
  chartedCountries: new Set(), // Stores selected countries for line chart
  currentSelected: null, // Currently selected country geocode for bar chart
  timeColorCache: {}, // Cache for time-based valuesByGeo
};

let timeMatchLevel = "none"; // Default value

Object.defineProperty(state, "timeMatchLevel", {
  get() {
    return timeMatchLevel;
  },
  set(value) {
    if (!VALID_TIME_MATCH_LEVELS.includes(value)) {
      console.warn(
        `Invalid timeMatchLevel: ${value}. Possible values: [${VALID_TIME_MATCH_LEVELS.join(", ")}]`
      );
      return false; // Prevent assignment
    }
    timeMatchLevel = value;
  },
  enumerable: true,
  configurable: true,
});
