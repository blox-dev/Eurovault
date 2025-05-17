export let state = {
  datasets: {}, // Global object to store all datasets
  metadata: {}, // Global object to store all metadata
  filteredData: [], // Current filtered dataset
  selectedDataset: null, // Current metadata
  chartedCountries: new Set(), // Stores selected countries for line chart
  currentSelected: null, // Currently selected country geocode for bar chart
  timeColorCache: {}, // Cache for time-based valuesByGeo
};
