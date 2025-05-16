// Import Mapbox and D3 as ESM modules
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiaHBuMDA1IiwiYSI6ImNtYWp3cWNpcjAyMnMyanE0dmt4YmkwOHUifQ.NIF6DPuW-u72JR-WTg5tTw';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18, // Maximum allowed zoom
});

// Add a bike lane layer to the map
function addBikeLaneLayer(map, id, source) {
    map.addLayer({
        id: id,
        type: 'line',
        source: source,
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.4,
        },
    });
}

// Project station coordinates to map pixel coordinates
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

// Compute arrivals, departures, and total traffic for each station
function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    );

    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id,
    )

    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

// Filter trips by time (minutes since midnight)
function filterTripsbyTime(trips, timeFilter) {
    function minutesSinceMidnight(date) {
        return date.getHours() * 60 + date.getMinutes();
    }

    return timeFilter === -1
        ? trips // If no filter is applied (-1), return all trips
        : trips.filter((trip) => {
            // Convert trip start and end times to minutes since midnight
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);

            // Include trips that started or ended within 60 minutes of the selected time
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

// Main logic after map loads
map.on('load', async () => {
    // Add GeoJSON sources for bike routes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'assets/cambridge_route.geojson',
    });

    // Add bike lane layers using the reusable function
    addBikeLaneLayer(map, 'boston_bike_lanes', 'boston_route');
    addBikeLaneLayer(map, 'cambri_bike_lanes', 'cambridge_route');

    // Load trip data from CSV
    let trips = null;
    try {
        trips = await d3.csv(
            'assets/bluebikes_traffic.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                return trip;
            }
        );
    }
    catch (error) {
        console.error('Error loading CSV:', error);
    };

    // Load station data from JSON and compute traffic
    let stations;
    try {
        const jsonurl = 'assets/bluebikes_stations.json';
        const jsonData = await d3.json(jsonurl);
        stations = computeStationTraffic(jsonData.data.stations, trips);
    } catch (error) {
        console.error('Error loading JSON:', error);
    };

    // Select SVG overlay for D3 circles
    const svg = d3.select('#map').select('svg');
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

    // Append circles to the SVG for each station
    const circles = svg
        .selectAll('circle')
        .data(stations, (d) => d.short_name) // Use station short_name as key
        .enter()
        .append('circle')
        .attr('fill', 'steelblue') // Circle fill color
        .attr('stroke', 'white') // Circle border color
        .attr('stroke-width', 1) // Circle border thickness
        .attr('opacity', 0.8) // Circle opacity
        .style('--departure-ratio', (d =>
            stationFlow(d.departures / d.totalTraffic)
        ))
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .each(function (d) {
            d3.select(this)
                .append('title')
                .text(
                    `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
                );
        });

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
            .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions); // Update during map movement
    map.on('zoom', updatePositions); // Update during zooming
    map.on('resize', updatePositions); // Update on window resize
    map.on('moveend', updatePositions); // Final adjustment after movement ends

    // Time slider and labels
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    // Update time display and scatterplot based on slider
    function updateTimeDisplay() {
        // Format minutes since midnight as a time string
        function formatTime(minutes) {
            const date = new Date(0, 0, 0, 0, minutes);
            return date.toLocaleString('en-US', { timeStyle: 'short' });
        }

        // Update scatterplot for the selected time filter
        function updateScatterPlot(timeFilter) {
            // Get only the trips that match the selected time filter
            const filteredTrips = filterTripsbyTime(trips, timeFilter);
            // Recompute station traffic based on the filtered trips
            const filteredStations = computeStationTraffic(stations, filteredTrips);
            // Adjust radius scale for filtered view
            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
            // Update the scatterplot by adjusting the radius of circles
            circles
                .data(filteredStations, (d) => d.short_name)
                .join('circle') // Ensure the data is bound correctly
                .attr('r', (d) => d.totalTraffic > 0 ? radiusScale(d.totalTraffic): 0) // Update circle sizes
                .style('--departure-ratio', (d) =>
                    stationFlow(d.departures / d.totalTraffic),
                );
        }

        let timeFilter = Number(timeSlider.value);

        if (timeFilter === -1) {
            selectedTime.textContent = '';
            anyTimeLabel.style.display = 'block';
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none';
        }
        updateScatterPlot(timeFilter);
    }

    // Listen for slider input and update display
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
});
