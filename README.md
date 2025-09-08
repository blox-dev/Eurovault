# EuroVault

European Statistics Visualisation Tool

## Features

- **Interactive Map**: View and compare data across EU countries
- **Customizable Preferences**: Choose what data you want to see, by selecting different datasets, parameters and time periods
- **Up-to-Date Information**: Access the latest statistics from Eurostat through the metadata editor

## Technologies Used

- **Data Sources**: 
  - [Eurostat data](https://ec.europa.eu/eurostat/data/database)
  - [Map](https://ec.europa.eu/eurostat/web/gisco/geodata/administrative-units)
  <!-- - [Codelist](https://webgate.ec.europa.eu/fusionregistry/search.html?search=SCL_UNIT) -->
- **Frameworks & Libraries**:
  - [D3.js](https://d3js.org/)
  - [Node.js](https://nodejs.org/)

## Installation

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/en/download) installed (version 14.0 or later)

### Steps

1. Download the project:
   ```sh
   git clone https://github.com/blox-dev/eurovault.git
   cd eurovault
   ```
2. Install necessary files:
   ```sh
   npm install
   ```
3. Launch the application:
   ```sh
   npm start
   ```

## Usage

1. Open your browser and go to `http://localhost:3000/`
2. Browse the interactive map to compare EU countries
3. Use the dataset picker, filters and time scale to explore data
4. Download and explore more datasets using the metadata editor

## Video Demo

Check out our live demo to see EuroVault in action: 

[Try the demo](https://blox-dev.github.io/demos/live/eurovault/index.html)

## License

This project is available under the MIT License