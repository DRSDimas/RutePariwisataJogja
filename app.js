const map = L.map('map').setView([-7.7956, 110.3695], 11);
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsList = document.getElementById('results-list');
const dashboardList = document.getElementById('dashboard-list');

let allPois = []; 
let userMarker;
let poiMarkersLayer = L.layerGroup().addTo(map);
let currentWaypoints = [];

const shamrockIcon = L.icon({
    iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <path fill="#33ce7d" stroke="#010101" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>`),
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});


const userIcon = L.icon({
    iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="#c62d70">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>`),
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
});


L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);


const routingControl = L.Routing.control({
    waypoints: [],
    router: new L.Routing.OSRMv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
    }),
    show: false,
    addWaypoints: false,
    routeWhileDragging: false,
    fitSelectedRoutes: true,
    createMarker: function() { return null; } 
}).addTo(map);


async function loadPois() {
    try {
        const response = await fetch('wisata_diy.geojson');
        const data = await response.json();
        allPois = data.features;
    } catch (error) {
        console.error('Gagal memuat data POI:', error);
        alert('Gagal memuat data pariwisata. Silakan coba lagi.');
    }
}


async function geocodeAddress(address) {
    showLoading('Mencari lokasi...');
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const location = data[0];
            const latLng = L.latLng(location.lat, location.lon);
            handleLocationFound(latLng, location.display_name);
        } else {
            alert('Lokasi tidak ditemukan.');
        }
    } catch (error) {
        console.error('Error Geocoding:', error);
        alert('Gagal mencari lokasi. Periksa koneksi internet Anda.');
    } finally {
        hideLoading();
    }
}


function handleLocationFound(latLng, displayName) {
    map.setView(latLng, 13);
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    userMarker = L.marker(latLng, { icon: userIcon }).addTo(map)
        .bindPopup(`<b>Lokasi Anda:</b><br>${displayName}`)
        .openPopup();
    
    currentWaypoints = [latLng]; 
    findNearestPois(latLng);
}


async function findNearestPois(userLatLng) {
    showLoading('Mencari wisata terdekat...');
    resultsList.innerHTML = '';
    poiMarkersLayer.clearLayers();

  
    const poisWithDistance = allPois.map(poi => {
        const poiLatLng = L.latLng(poi.geometry.coordinates[1], poi.geometry.coordinates[0]);
        const distance = turf.distance(turf.point([userLatLng.lng, userLatLng.lat]), turf.point([poiLatLng.lng, poiLatLng.lat]));
        return { ...poi, distance };
    });
    poisWithDistance.sort((a, b) => a.distance - b.distance);
    const candidates = poisWithDistance.slice(0, 20);

   
    const promises = candidates.map(poi => {
        const poiLatLng = L.latLng(poi.geometry.coordinates[1], poi.geometry.coordinates[0]);
        const url = `https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${poiLatLng.lng},${poiLatLng.lat}?overview=false`;
        return fetch(url).then(res => res.json());
    });
    
    try {
        const results = await Promise.all(promises);
        const poisWithDuration = candidates.map((poi, index) => {
            const duration = (results[index].routes && results[index].routes[0]) ? results[index].routes[0].duration : Infinity;
            return { ...poi, duration };
        });

        poisWithDuration.sort((a, b) => a.duration - b.duration);
        const top5Pois = poisWithDuration.slice(0, 5);

        displayNearestResults(top5Pois);
        displayPoiMarkers(candidates); 

    } catch (error) {
        console.error("Error saat fetching OSRM:", error);
        displayNearestResults(candidates.slice(0, 5));
        displayPoiMarkers(candidates);
    } finally {
        hideLoading();
    }
}

function displayNearestResults(pois) {
    resultsList.innerHTML = '<ul>' + pois.map(poi => {
        const durationInMinutes = poi.duration ? Math.round(poi.duration / 60) : 'N/A';
        const coordsString = [...poi.geometry.coordinates].reverse().join(',');
        return `<li data-coords="${coordsString}">
                    <strong>${poi.properties.nama_objek}</strong>
                    <div class="item-desc">
                        ${poi.duration ? `Sekitar ${durationInMinutes} menit berkendara` : `Jarak lurus: ${poi.distance.toFixed(2)} km`}
                    </div>
                </li>`;
    }).join('') + '</ul>';
    
    document.querySelectorAll('#results-list li').forEach(item => {
        item.addEventListener('click', (e) => {
            const coords = e.currentTarget.dataset.coords.split(',').map(Number);
            const poiLatLng = L.latLng(coords[0], coords[1]);
            
            currentWaypoints = [userMarker.getLatLng(), poiLatLng];
            routingControl.setWaypoints(currentWaypoints);
            
            map.fitBounds(L.latLngBounds(currentWaypoints));
            updateDashboard(userMarker.getLatLng(), poiLatLng);
        });
    });
}

function displayPoiMarkers(pois) {
    poiMarkersLayer.clearLayers();
    pois.forEach(poi => {
        const poiLatLng = L.latLng(poi.geometry.coordinates[1], poi.geometry.coordinates[0]);
        const marker = L.marker(poiLatLng, { icon: shamrockIcon })
            .bindPopup(`<b>${poi.properties.nama_objek}</b><br>${poi.properties.deskripsi}`)
            .on('click', () => {
                currentWaypoints = [userMarker.getLatLng(), poiLatLng];
                routingControl.setWaypoints(currentWaypoints);
                updateDashboard(userMarker.getLatLng(), poiLatLng);
            });
        poiMarkersLayer.addLayer(marker);
    });
}

function updateDashboard(originLatLng, destinationLatLng) {
    dashboardList.innerHTML = '';
    const mainBearing = turf.bearing(
        turf.point([originLatLng.lng, originLatLng.lat]), 
        turf.point([destinationLatLng.lng, destinationLatLng.lat])
    );
    
    const onTheWayPois = allPois.filter(poi => {
        const poiLatLng = L.latLng(poi.geometry.coordinates[1], poi.geometry.coordinates[0]);
        if (poiLatLng.equals(destinationLatLng) || poiLatLng.equals(originLatLng)) {
            return false; 
        }
        
        const bearingToPoi = turf.bearing(
            turf.point([originLatLng.lng, originLatLng.lat]), 
            turf.point([poiLatLng.lng, poiLatLng.lat])
        );
        
        const bearingDifference = Math.abs(mainBearing - bearingToPoi);
        return bearingDifference < 30 || bearingDifference > 330;
    });

    onTheWayPois.forEach(poi => {
        const item = document.createElement('div');
        item.className = 'dashboard-item';
        item.innerText = poi.properties.nama_objek;
        item.dataset.coords = [...poi.geometry.coordinates].reverse().join(',');

        item.addEventListener('click', () => {
            const coords = item.dataset.coords.split(',').map(Number);
            const nextPoiLatLng = L.latLng(coords[0], coords[1]);
            
            currentWaypoints.push(nextPoiLatLng);
            routingControl.setWaypoints(currentWaypoints);
            
            const lastLegOrigin = currentWaypoints[currentWaypoints.length - 2];
            updateDashboard(lastLegOrigin, nextPoiLatLng);
        });

        dashboardList.appendChild(item);
    });
}


function showLoading(message) {
    let loadingDiv = document.getElementById('loading-overlay');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-overlay';
        loadingDiv.className = 'loading';
        document.body.appendChild(loadingDiv);
    }
    loadingDiv.innerText = message;
    loadingDiv.style.display = 'flex';
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading-overlay');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}


searchButton.addEventListener('click', () => {
    if (searchInput.value) {
        geocodeAddress(searchInput.value);
    }
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && searchInput.value) {
        geocodeAddress(searchInput.value);
    }
});

window.onload = loadPois;
