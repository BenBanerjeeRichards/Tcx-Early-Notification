var map;
var mapLayerGroup;
var newGroup;
var oldGroup;
var tcxContents = {
    "coursePoints": [],
    "trackPoints": [],
    "xmlDoc": undefined,
    "newCoursePoints": undefined
};


var redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function error(msg) {
    document.getElementById("error").innerText = msg;
}

function clearError() {
    error("");
}

function onFileUploaded(evt) {
    clearError();
    var file = evt.target.files[0];
    var path = evt.target.value;
    tcxContents["fileName"] = path.split("\\").pop();

    var reader = new FileReader();
    reader.onload = function (theFile) {
        return function (e) {
            var xml = e.target.result;
            parser = new DOMParser();
            xmlDoc = parser.parseFromString(xml, "text/xml");
            if (loadTcxFile(xmlDoc)) {
                tcxContents["xmlDoc"] = xmlDoc;
                addBaseMarkersWithRoute();
                computeDistanceMarkers();
            }
        }
    }(file);
    reader.readAsText(file)
}

function downloadAsFile(filename, data) {
    var blob = new Blob([data], {type: 'text/csv'});
    if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveBlob(blob, filename);
    } else {
        var elem = window.document.createElement('a');
        elem.href = window.URL.createObjectURL(blob);
        elem.download = filename;
        document.body.appendChild(elem);
        elem.click();
        document.body.removeChild(elem);
    }
}


function loadTcxFile(xmlDoc) {
    var coursePointsXml = Array.prototype.slice.call(xmlDoc.getElementsByTagName("CoursePoint"));
    var coursePoints = [];

    if (coursePointsXml.length === 0) {
        error("Error: no cue sheet found in file. Tip: use ridewithgps.com to generate one. Strava not supported.")
        return false;
    }

    coursePointsXml.forEach(function (coursePoint) {
        var posXml = coursePoint.childNodes[5];
        var lat = parseFloat(posXml.getElementsByTagName("LatitudeDegrees")[0].textContent);
        var long = parseFloat(posXml.getElementsByTagName("LongitudeDegrees")[0].textContent);

        coursePoints.push({
            "name": coursePoint.childNodes[1].textContent,
            "lat": lat,
            "long": long,
            "node": coursePoint.childNodes[7].textContent,
            "instruction": coursePoint.childNodes[9].textContent,
            "time": coursePoint.childNodes[3].textContent
        })
    });

    var trackPointsXml = Array.prototype.slice.call(xmlDoc.getElementsByTagName("Trackpoint"));
    var points = [];
    var currentCoursePointIdx = 0;

    if (trackPointsXml.length === 0) {
        error("Error: No route found in file");
        return false;
    }

    trackPointsXml.forEach(function (trackPoint, i) {
        var latPart = trackPoint.childNodes[3].getElementsByTagName("LatitudeDegrees");
        var longPart = trackPoint.childNodes[3].getElementsByTagName("LongitudeDegrees");
        var lat = parseFloat(latPart[0].textContent);
        var long = parseFloat(longPart[0].textContent);
        var distance = trackPoint.childNodes[7].textContent;
        var elevation = trackPoint.childNodes[5].textContent;

        points.push({
            "lat": lat,
            "long": long,
            "distance": distance,
            "elevation": elevation
        });


        if (currentCoursePointIdx < coursePoints.length) {
            // Associate course point with point
            var pointTime = trackPoint.childNodes[1].textContent;
            if (coursePoints[currentCoursePointIdx]["time"] === pointTime) {
                coursePoints[currentCoursePointIdx]["pointIndex"] = i;
                currentCoursePointIdx++;
            }
        }
    });

    // Update view to something over the course
    var midPoint = coursePoints[Math.floor(coursePoints.length / 2)];
    map.setView([midPoint["lat"], midPoint["long"]], 11);

    tcxContents["coursePoints"] = coursePoints;
    tcxContents["trackPoints"] = points;

    return true;
}

function addBaseMarkersWithRoute() {
    var coursePoints = tcxContents["coursePoints"];
    var trackPoints = tcxContents["trackPoints"];
    var courseMarkers = [];

    coursePoints.forEach(function (point) {
        courseMarkers.push(L.marker([point["lat"], point["long"]])
            .bindPopup(point["instruction"]))
    });

    var courseMarkerGroup = L.layerGroup(courseMarkers);
    oldGroup = map.addLayer(courseMarkerGroup);
    // mapLayerGroup.addOverlay(courseMarkerGroup, "original");

    var points = [];
    trackPoints.forEach(function (trackPoint) {
        points.push(new L.LatLng(trackPoint["lat"], trackPoint["long"]));
    });

    var routeLinePoly = new L.Polyline(points, {
        color: 'black',
        weight: 3,
        opacity: 0.5,
        smoothFactor: 1
    });

    routeLinePoly.addTo(map);
}

function updateDistanceRangeDisplay() {
    var val = document.getElementById("distanceRange").value;
    document.getElementById("distanceOutput").innerHTML = val;
    document.getElementById("distanceOutputMetric").innerHTML = Math.floor(val / 3.2);
}

function computeDistanceMarkers() {
    if (tcxContents === undefined) return;
    if (newGroup !== undefined) {
        console.log("Removing ", newGroup);
        map.removeLayer(newGroup);
    }

    var earlyDistance = (document.getElementById("distanceRange").value * 0.3048);        // temp for now, includes ft->m conversion

    var newCoursePointLocations = {};
    var coursePoints = tcxContents["coursePoints"];
    var trackPoints = tcxContents["trackPoints"];

    var newCourseMarkers = [];

    // Now add markers for new points
    coursePoints.forEach(function (coursePoint, i) {
        // Generic nodes are not navigation nodes
        if (coursePoint["node"] !== "Generic") {
            // Calculate previous point
            // Go back distance if possible, otherwise
            var pointIdx = coursePoint["pointIndex"];
            var prevPointIndex = i === 0 ? undefined : coursePoints[i - 1]["pointIndex"];
            var initDistance = trackPoints[pointIdx]["distance"];
            // First consider case where previous turn is within distance
            // So reduce distance as far as possible
            var newPointIndex = -1;

            if (initDistance - trackPoints[prevPointIndex]["distance"] <= earlyDistance) {
                newPointIndex = prevPointIndex + 1;
            } else {
                // Instead work backwards until we get first point greater than earlyDistance
                var currIdx = pointIdx - 1;
                while (currIdx > 0 && initDistance - trackPoints[currIdx]["distance"] <= earlyDistance) {
                    currIdx--;
                }
                newPointIndex = currIdx;
            }
            var newTrackPoint = trackPoints[newPointIndex];
            var newPoint = new L.LatLng(newTrackPoint["lat"], newTrackPoint["long"]);
            var newMarker = L.marker(newPoint, {"icon": redIcon})
                .bindPopup(coursePoint["instruction"]);
            newCourseMarkers.push(newMarker);
            newCoursePointLocations[coursePoint["time"]] = newPoint;
        }
    });

    tcxContents["newCoursePoints"] = newCoursePointLocations;

    var courseMarkerGroup = L.layerGroup(newCourseMarkers);
    newGroup = courseMarkerGroup;
    map.addLayer(courseMarkerGroup);
    // mapLayerGroup.addOverlay(courseMarkerGroup, "New");

}

function writeAndDownloadNewTcx(newCoursePointLocations) {
    console.log("newCoursePointLocations", newCoursePointLocations);
    // Now alter XML
    var xmlDoc = tcxContents["xmlDoc"];
    var coursePointsXml = Array.prototype.slice.call(xmlDoc.getElementsByTagName("CoursePoint"));
    coursePointsXml.forEach(function (coursePointXml) {
        var time = coursePointXml.childNodes[3].textContent;
        if (newCoursePointLocations[time] !== undefined) {
            // Update actual position
            coursePointXml.childNodes[5].getElementsByTagName("LatitudeDegrees")[0].textContent = newCoursePointLocations[time].lat;
            coursePointXml.childNodes[5].getElementsByTagName("LongitudeDegrees")[0].textContent = newCoursePointLocations[time].lng;
        }
    });

    var newXmlString = new XMLSerializer().serializeToString(xmlDoc.documentElement);
    downloadAsFile(tcxContents["fileName"].replace(".tcx", "") + "_EarlyTurnNotif.tcx", newXmlString);
}

window.onload = function () {
    // Center map over UK
    map = L.map('map').setView([55.5, -0.09], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapLayerGroup = L.control.layers(null, {}).addTo(map);

    document.getElementById('file').addEventListener('change', onFileUploaded, false);

    var slider = document.getElementById("distanceRange");
    slider.oninput = updateDistanceRangeDisplay;
    slider.onchange = computeDistanceMarkers;
    updateDistanceRangeDisplay();

    document.getElementById("downloadBtn").onclick = function () {
        if (tcxContents["newCoursePoints"] !== undefined) {
            writeAndDownloadNewTcx(tcxContents["newCoursePoints"])
        }
    }
};