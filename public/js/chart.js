"use strict";

import { chartContainer } from "./main.js";
import { europe } from "./map.js";
import { state } from "./state.js";
import { compareTimes } from "./utils.js";

export function showCountryChart(geoCode) {
  const countryName = europe.features.find(
    (f) => f.properties.EUROSTAT === geoCode
  ).properties.ADMIN;

  chartContainer.html("").attr("data-chart-type", "bar"); // Clear previous chart

  const svg = chartContainer
    .append("svg")
    .attr("id", "chart-svg")
    .attr("width", "100%")
    .attr("height", "100%");

  // Add close button
  chartContainer
    .append("button")
    .text("X")
    .classed("chart-close-button", true)
    .on("click", () => {
      state.currentSelected = null;
      state.chartedCountries.clear();
      // Remove chart
      chartContainer.html("").attr("data-chart-type", "");
    });

  // Filter the historical data
  const countryData = state.filteredData
    .filter((d) => d.GEO === geoCode && !isNaN(+d.VALUE))
    .sort((a, b) => compareTimes(a.TIME, b.TIME));

  const chartContainerBoundingRect = chartContainer
    .node()
    .getBoundingClientRect();
  const width = chartContainerBoundingRect.width;
  const height = chartContainerBoundingRect.height;
  const margin = { top: 50, right: 30, bottom: 80, left: 60 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Scales
  const x = d3
    .scaleBand()
    .domain(countryData.map((d) => d.TIME))
    .range([0, plotWidth])
    .padding(0.1);

  const y = d3
    .scaleLinear()
    .domain([
      d3.min(countryData, (d) => +d.VALUE) || 0,
      d3.max(countryData, (d) => +d.VALUE) || 1,
    ])
    .nice()
    .range([plotHeight, 0]);

  const every = Math.ceil(x.domain().length / 10);
  // Axes
  g.append("g")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(
      d3.axisBottom(x).tickValues(x.domain().filter((_, i) => i % every == 0))
    )
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  g.append("g").call(d3.axisLeft(y));

  // Axis labels
  g.append("text")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 60)
    .attr("text-anchor", "middle")
    .attr("fill", "black")
    .text(state.metadata[state.selectedDataset]?.x || "Year");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -plotHeight / 2)
    .attr("y", -45)
    .attr("text-anchor", "middle")
    .attr("fill", "black")
    .text(state.metadata[state.selectedDataset]?.y || "Value");

  // Chart title
  let title = `${countryName} - ${
    state.metadata[state.selectedDataset]?.label || ""
  }`;
  if (title.length > 40) {
    title = title.slice(0, 40) + "...";
  }
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", 30)
    .attr("text-anchor", "middle")
    .style("font-size", "1.1rem")
    .style("font-weight", "bold")
    .text(title);

  // Bars
  const bars = g
    .selectAll(".bar")
    .data(countryData)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d.TIME))
    .attr("y", (d) => y(+d.VALUE))
    .attr("width", x.bandwidth())
    .attr("height", (d) => plotHeight - y(+d.VALUE))
    .attr("fill", "#4682b4");

  // Tooltip
  const tooltip = d3.select("#chart-tooltip").style("opacity", 0);

  const topOffset = chartContainerBoundingRect.top;
  const leftOffset = chartContainerBoundingRect.left;

  bars
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", d3.color("#4682b4").darker(1));
      const bar = d3.select(event.currentTarget);
      // console.log(bar.attr("x"), bar.attr("y"));
      const xPos = +bar.attr("x") + x.bandwidth() / 2;
      const yPos = +bar.attr("y");

      tooltip.transition().duration(200).style("opacity", 0.95);
      tooltip.html(`${d.VALUE}`);

      // Position tooltip centered above the bar
      tooltip
        .style(
          "left",
          leftOffset +
            margin.left +
            xPos -
            tooltip.node().offsetWidth / 2 +
            "px"
        )
        .style("top", topOffset + margin.top + yPos - 30 + "px"); // 30px above bar
    })
    .on("mouseout", function () {
      d3.select(this).attr("fill", "#4682b4");
      tooltip.transition().duration(300).style("opacity", 0);
    });
}

export function showLineChart(countries) {
  chartContainer.html("").attr("data-chart-type", "line"); // Clear previous chart

  const svg = chartContainer
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

  chartContainer
    .append("button")
    .text("X")
    .classed("chart-close-button", true)
    .on("click", () => {
      state.currentSelected = null;
      state.chartedCountries.clear();
      chartContainer.html("").attr("data-chart-type", "");
    });

  const chartContainerBoundingRect = chartContainer
    .node()
    .getBoundingClientRect();
  const width = chartContainerBoundingRect.width;
  const height = chartContainerBoundingRect.height;
  const margin = { top: 50, right: 150, bottom: 80, left: 60 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Build time domain and country data
  let allTimes = new Set();
  let countrySeries = [];

  countries.forEach((geo) => {
    const rows = state.filteredData
      .filter((d) => d.GEO === geo && !isNaN(+d.VALUE))
      .map((d) => ({ time: d.TIME, value: +d.VALUE }))
      .sort((a, b) => compareTimes(a.time, b.time));

    rows.forEach((r) => allTimes.add(r.time));

    countrySeries.push({
      geo,
      name: europe.features.find((f) => f.properties.EUROSTAT === geo)
        .properties.ADMIN,
      values: rows,
    });
  });

  const times = Array.from(allTimes).sort(compareTimes);

  // Scales
  const x = d3.scaleBand().domain(times).range([0, plotWidth]).padding(0.1);

  const y = d3
    .scaleLinear()
    .domain([
      d3.min(countrySeries, (c) => d3.min(c.values, (d) => d.value)) || 0,
      d3.max(countrySeries, (c) => d3.max(c.values, (d) => d.value)) || 1,
    ])
    .nice()
    .range([plotHeight, 0]);

  const color = d3.scaleOrdinal().domain(countries).range(d3.schemeCategory10);

  const every = Math.ceil(x.domain().length / 10);
  // Axes
  g.append("g")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(
      d3.axisBottom(x).tickValues(x.domain().filter((_, i) => i % every === 0))
    )
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  g.append("g").call(d3.axisLeft(y));

  // Axis labels
  g.append("text")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 60)
    .attr("text-anchor", "middle")
    .attr("fill", "black")
    .text(state.metadata[state.selectedDataset]?.x || "Year");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -plotHeight / 2)
    .attr("y", -45)
    .attr("text-anchor", "middle")
    .attr("fill", "black")
    .text(state.metadata[state.selectedDataset]?.y || "Value");

  // Chart title
  let title = `${state.metadata[state.selectedDataset]?.label || ""}`;
  if (title.length > 40) {
    title = title.slice(0, 40) + "...";
  }
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", 30)
    .attr("text-anchor", "middle")
    .style("font-size", "1.1rem")
    .style("font-weight", "bold")
    .text(title);

  // Lines
  const line = d3
    .line()
    .x((d) => x(d.time))
    .y((d) => y(d.value));

  g.selectAll(".line")
    .data(countrySeries)
    .enter()
    .append("path")
    .attr("data-country", (d) => d.geo)
    .attr("fill", "none")
    .attr("stroke", (d) => color(d.geo))
    .attr("stroke-width", 2)
    .attr("d", (d) => line(d.values));

  const tooltip = d3.select("#chart-tooltip").style("opacity", 0);

  const leftOffset = chartContainerBoundingRect.left;
  const topOffset = chartContainerBoundingRect.top;

  // Add circles to each data point
  countrySeries.forEach((series) => {
    g.selectAll(`.circle-${series.geo}`)
      .data(series.values)
      .enter()
      .append("circle")
      .attr("data-country", series.geo)
      .attr("cx", (d) => x(d.time))
      .attr("cy", (d) => y(d.value))

      .attr("r", 4)
      .attr("fill", color(series.geo))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        tooltip.text(`${series.name} (${d.time}): ${d.value}`);

        const bar = d3.select(event.currentTarget);
        const xPos = +bar.attr("cx") + x.bandwidth() / 2;
        const yPos = +bar.attr("cy");

        tooltip.transition().duration(200).style("opacity", 0.95);

        // Position tooltip centered above the bar
        tooltip
          .style(
            "left",
            leftOffset +
              margin.left +
              xPos -
              tooltip.node().offsetWidth / 2 +
              "px"
          )
          .style("top", topOffset + margin.top + yPos - 30 + "px"); // 30px above bar
      })
      .on("mouseout", function () {
        tooltip.transition().duration(200).style("opacity", 0);
      });
  });

  // Legend
  const legend = svg
    .append("g")
    .attr(
      "transform",
      `translate(${plotWidth + margin.left + 20}, ${margin.top})`
    );

  countrySeries.forEach((d, i) => {
    const group = legend
      .append("g")
      .attr("transform", `translate(0, ${i * 20})`)
      .style("cursor", "pointer")
      .attr("data-country", d.geo);
    group
      .append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", color(d.geo));
    group
      .append("text")
      .attr("x", 16)
      .attr("y", 10)
      .text(d.name)
      .style("font-size", "12px")
      .classed("noselect", true);

    group.on("click", function (e) {
      const elem = d3.select(this);
      const hidden = !elem.classed("strike");
      elem.classed("strike", hidden);
      const geoCode = elem.attr("data-country");
      if (geoCode) {
        // Hide both the line and the circles
        chartContainer
          .selectAll(`path[data-country='${geoCode}']`)
          .classed("hidden", hidden);
        chartContainer
          .selectAll(`circle[data-country='${geoCode}']`)
          .classed("hidden", hidden);
      }
    });
  });
}
