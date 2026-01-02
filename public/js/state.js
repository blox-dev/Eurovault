const VALID_TIME_MATCH_LEVELS = [
  "none", // does not attempt time matching
  "strict", // only matches exact string
  "smart", // matches approximate terms, e.g. 2023-04 = 2023 = 2023-Q1 = 2023-S1
];

export let state = {
  datasets: {}, // global object to store all datasets
  metadata: {}, // global object to store all metadata
  filteredData: [], // current filtered dataset
  selectedDataset: null, // current metadata
  chartedCountries: new Set(), // stores selected countries for line chart
  currentSelected: null, // currently selected country geocode for bar chart
  timeColorCache: {}, // cache for time-based valuesByGeo
  expandedLegend: window.innerWidth > 768, // legend is expanded on larger devices
};

let timeMatchLevel = "none"; // default value

Object.defineProperty(state, "timeMatchLevel", {
  get() {
    return timeMatchLevel;
  },
  set(value) {
    if (!VALID_TIME_MATCH_LEVELS.includes(value)) {
      console.warn(
        `Invalid timeMatchLevel: ${value}. Possible values: [${VALID_TIME_MATCH_LEVELS.join(", ")}]`
      );
      return false; // prevent assignment
    }
    timeMatchLevel = value;
  },
  enumerable: true,
  configurable: true,
});
