
var map;

var redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

var earlyDistance = (500 * 0.3048);        // temp for now, includes ft->m conversion

function onFileUploaded(evt) {
    var file = evt.target.files[0];
    var reader = new FileReader();
    reader.onload = function(theFile) {
        return function(e) {
            var xml = e.target.result;
            parser = new DOMParser();
            xmlDoc = parser.parseFromString(xml, "text/xml");

            var coursePointsXml = Array.prototype.slice.call(xmlDoc.getElementsByTagName("CoursePoint"));
            var coursePoints = []

            coursePointsXml.forEach(function(coursePoint) {
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

            coursePoints.forEach(function(point) {
                L.marker([point["lat"], point["long"]]).addTo(map)
                    .bindPopup(point["instruction"])
                    .openPopup();
            })

            var midPoint = coursePoints[Math.floor(coursePoints.length / 2)]
            map.setView([midPoint["lat"], midPoint["long"]], 10)

            var trackPointsXml = Array.prototype.slice.call(xmlDoc.getElementsByTagName("Trackpoint"));
            var trackPoints = []
            var points = []
            var currentCoursePointIdx = 0;

            trackPointsXml.forEach(function(trackPoint, i) {
                var latPart = trackPoint.childNodes[3].getElementsByTagName("LatitudeDegrees")
                var longPart = trackPoint.childNodes[3].getElementsByTagName("LongitudeDegrees")
                var lat = parseFloat(latPart[0].textContent)
                var long = parseFloat(longPart[0].textContent)
                var distance = trackPoint.childNodes[7].textContent
                var elevation = trackPoint.childNodes[5].textContent

                points.push({
                    "lat": lat,
                    "long": long,
                    "distance": distance,
                    "elevation": elevation
                })

                trackPoints.push(new L.LatLng(lat, long))

                if (currentCoursePointIdx < coursePoints.length) {
                    // Associate course point with point
                    var pointTime = trackPoint.childNodes[1].textContent;
                    if (coursePoints[currentCoursePointIdx]["time"] == pointTime) {
                        coursePoints[currentCoursePointIdx]["pointIndex"] = i
                        currentCoursePointIdx++;
                    }
                }
            })

            // Now add markers for new points
            coursePoints.forEach(function(coursePoint, i) {
                // Generic nodes are not navigation nodes
                if (coursePoint["node"] !== "Generic" ) {
                    // Calculate previous point
                    // Go back distance if possible, otherwise
                    var pointIdx = coursePoint["pointIndex"]
                    var distancePack = 0;
                    var prevPointIndex = i === 0 ? undefined : coursePoints[i - 1]["pointIndex"]
                    var initDistance = points[pointIdx]["distance"]
                    // First consider case where previous turn is within distance
                    // So reduce distance as far as possible
                    var newPointIndex = -1;

                    if (initDistance - points[prevPointIndex]["distance"] <= earlyDistance) {
                        newPointIndex = prevPointIndex + 1;
                    } else {
                        // Instead work backwards until we get first point greater than earlyDistance
                        var currIdx = pointIdx - 1;
                        console.log(earlyDistance, initDistance - points[currIdx]["distance"])
                        while (currIdx > 0 && initDistance - points[currIdx]["distance"] <= earlyDistance) {
                            console.log("Q", earlyDistance, initDistance - points[currIdx]["distance"], currIdx)
                            currIdx--;
                        }
                        newPointIndex = currIdx;
                    }
                    console.log("P", newPointIndex, pointIdx, pointIdx -newPointIndex )
                    var newPoint = trackPoints[newPointIndex]
                    L.marker(newPoint, {"icon": redIcon}).addTo(map)
                        .bindPopup(coursePoint["instruction"])
                        .openPopup();

                }
            });

            var firstpolyline = new L.Polyline(trackPoints, {
                color: 'red',
                weight: 3,
                opacity: 0.5,
                smoothFactor: 1
            });

            firstpolyline.addTo(map);
        }
    }(file);
    reader.readAsText(file)
}


window.onload = function() {
    map = L.map('map').setView([54.505, -0.09], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    document.getElementById('file').addEventListener('change', onFileUploaded, false);
}