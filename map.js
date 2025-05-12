// Import Mapbox as an ESM module
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

// Function to add a bike lane layer
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

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
}


map.on('load', async () => {
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

    let stations;
    try {
        const jsonurl = 'assets/bluebikes_stations.json';

        // Await JSON fetch
        const jsonData = await d3.json(jsonurl);
        stations = jsonData.data.stations;
        console.log('Loaded stations data');

    } catch (error) {
        console.error('Error loading JSON:', error);
    };

    const svg = d3.select('#map').select('svg');
    // Append circles to the SVG for each station
    const circles = svg
        .selectAll('circle')
        .data(stations)
        .enter()
        .append('circle')
        .attr('r', 5) // Radius of the circle
        .attr('fill', 'steelblue') // Circle fill color
        .attr('stroke', 'white') // Circle border color
        .attr('stroke-width', 1) // Circle border thickness
        .attr('opacity', 0.8); // Circle opacity

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

    let trips = null;
    try {
        trips = await d3.csv('assets/bluebikes_traffic.csv');
        console.log('Loaded traffic data');
    }
    catch (error) {
        console.error('Error loading CSV:', error);
    };

    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    );

    // TODO: Calculating traffic at each station
});




