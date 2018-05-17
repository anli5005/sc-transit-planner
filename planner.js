window.addEventListener("load", async (e) => {
  var queryString = location.search.substr(1);
  var query = {};
  queryString.split("&").forEach(function(part) {
    var item = part.split("=");
    query[item[0]] = decodeURIComponent(item[1]);
  });

  let data = query.data || "smeltville";

  // Compile services.
  let services = {};
  let serviceData = await (await fetch(`./data/${data}/services.json`)).json();
  serviceData.forEach((service) => {
    services[service.name] = service;
  });
  console.log("Compiled services.");
  console.log(services);

  // Compile stations.
  let stations = {};
  let places = [];
  let stationData = await (await fetch(`./data/${data}/overworld.json`)).json();
  stationData.forEach((station) => {
    stations[station.name] = station;
    places.push({id: station.name, label: station.label + " Station", station: station.name});
  });
  console.log("Compiled stations.");
  console.log(stations);

  // Compile places.
  let placeData = await (await fetch(`./data/${data}/places.json`)).json();
  places = places.concat(placeData).sort((a, b) => {
    if (a.label > b.label) {
      return 1;
    } else if (a.label < b.label) {
      return -1;
    } else {
      return 0;
    }
  });
  console.log("Compiled places.");
  console.log(places);

  let selects = document.querySelectorAll("select");
  selects.forEach((select) => {
    places.forEach((place, index) => {
      let option = document.createElement("option");
      option.setAttribute("value", index.toString());
      option.innerText = place.label;
      select.append(option);
    });
  });

  let destinationConnections = [];
  function getNeighbors(node, prev) {
    let neighbors = [];
    if (node.station) {
      return getNeighbors(stations[node.station], prev);
    } else if (node.stations) {
      neighbors = node.stations.map((station) => {
        let stationExits = stations[station].exits;
        let chosenExit;
        let chosenExitDist = Infinity;
        Object.keys(stationExits).forEach((key) => {
          let exit = {key: key, coords: stationExits[key].coords, name: stationExits[key].name};
          let dist = Math.sqrt(Math.pow(node.coords[0] - exit.coords[0], 2) + Math.pow(node.coords[1] - exit.coords[1], 2) + Math.pow(node.coords[2] - exit.coords[2], 2));
          if (dist < chosenExitDist) {
            chosenExit = exit;
            chosenExitDist = dist;
          }
        });
        console.log("Chose Exit " + chosenExit.key + ": " + chosenExit.name + " for station " + stations[station].label);
        return {origin: node, prev: prev, destination: stations[station], connection: {exit: chosenExit}, time: (prev ? prev.time || 0 : 0) + Math.max(chosenExitDist / 4, 5)};
      });
    } else {
      if (node.neighbors) {
        neighbors = node.neighbors.map((neighbor) => {
          let extraTime = prev ? prev.time || 0 : 0;
          if (prev && prev.connection.service && neighbor.service !== prev.connection.service) {
            extraTime += 7;
          }
          return {origin: node, prev: prev, destination: stations[neighbor.destination], connection: neighbor, time: extraTime + (neighbor.time || (neighbor.distance / services[neighbor.service].speed))}
        });
      }
      if (node.transfers) {
        neighbors = neighbors.concat(node.transfers.map((transfer) => {
          let exit = node.exits[transfer.exit];
          let entrance = stations[transfer.destination].exits[transfer.entrance];
          return {origin: node, prev: prev, destination: stations[transfer.destination], connection: transfer, time: (prev ? prev.time || 0 : 0) + Math.max(10, Math.sqrt(Math.pow(exit.coords[0] - entrance.coords[0], 2) + Math.pow(entrance.coords[1] - exit.coords[1], 2) + Math.pow(entrance.coords[2] - exit.coords[2], 2)) / 4)}
        }));
      }
    }

    destinationConnections.map((con) => {
      let connection = Object.assign({}, con);
      if (connection.origin == node) {
        connection.prev = prev;
        connection.time += (prev && prev.time) || 0;
        console.log(prev);
        neighbors.push(connection);
      }
    });

    return neighbors;
  }

  document.getElementById("route-button").addEventListener("click", (e) => {
    let originPlace = places[parseInt(document.getElementById("from-input").value)];
    let destinationPlace = places[parseInt(document.getElementById("to-input").value)];

    let visitedNodes = {};
    let currentNodes = [];
    let times = {};

    if (destinationPlace.stations) {
      destinationConnections = getNeighbors(destinationPlace).map((connection) => {
        return {origin: connection.destination, destination: connection.origin, connection: connection.connection, time: connection.time};
      });
    } else {
      destinationPlace = stations[destinationPlace.station];
      destinationConnections = [];
    }

    let visited = {destination: originPlace, connection: {origin: true}};
    let current;
    let isStopping = null;
    do {
      if (visited.destination == destinationPlace) {
        isStopping = visited;
        break;
      }

      visitedNodes[visited.destination.name || visited.destination.id] = true;
      currentNodes.splice(currentNodes.findIndex((node) => {
        return node.destination == visited.destination;
      }), 1);
      // Add neighbors to currentNodes.
      getNeighbors(visited.destination, visited).forEach((neighbor) => {
        if (!visitedNodes[neighbor.destination.name || neighbor.destination.id]) {
          if (!times[neighbor.destination.name || neighbor.destination.id] || neighbor.time < times[neighbor.destination.name || neighbor.destination.id]) {
            currentNodes.push(neighbor);
            times[neighbor.destination.name || neighbor.destination.id] = neighbor.time;
          };
        }
      });

      currentNodes.sort((a, b) => {
        if (a.time > b.time) {
          return 1;
        } else if (a.time < b.time) {
          return -1;
        } else {
          return 0;
        }
      });

      visited = currentNodes[0];
    } while (visited)

    let output = document.getElementById("route-output");
    let layout = document.getElementById("route-layout");
    layout.innerHTML = "";

    if (!isStopping) {
      console.log("Unable to find route");
      document.getElementById("route-error").classList.remove("d-none");
      document.getElementById("route-header").classList.add("d-none");
    } else {
      console.log("Found last segment");
      console.log(isStopping);
      console.log("Backtracking...");
      let route = [];
      let connections = [isStopping];
      let current = isStopping;
      while (current.prev) {
        connections.push(current.prev);
        current = current.prev;
      }
      let service;
      connections.forEach((connection) => {
        if (connection.connection.service) {
          if (service && connection.connection.service === service.service) {
            service.stops.push(connection.origin.label);
            service.time += connection.time - (connection.prev ? connection.prev.time || 0 : 0);
          } else {
            if (service) {
              service.origin = service.stops.splice(-1, 1)[0];
              service.stops.reverse();
              route.push(service);
            }
            service = {service: connection.connection.service, platform: connection.connection.platform, direction: connection.connection.direction, destination: connection.destination.label, stops: [connection.origin.label], time: connection.time - (connection.prev ? connection.prev.time || 0 : 0)};
          }
        } else if (connection.connection.entrance) {
          if (service) {
            service.origin = service.stops.splice(-1, 1)[0];
            service.stops.reverse();
            route.push(service);
          }
          route.push({type: "transfer", origin: connection.origin.label, destination: connection.destination.label, time: connection.time - (connection.prev ? connection.prev.time || 0 : 0), exit: connection.connection.exit});
          service = null;
        } else if (connection.connection.exit) {
          if (service) {
            service.origin = service.stops.splice(-1, 1)[0];
            service.stops.reverse();
            route.push(service);
          }
          route.push({type: "origin", origin: connection.origin.label, destination: connection.destination.label, time: connection.time - (connection.prev ? connection.prev.time || 0 : 0), exit: connection.connection.exit, isDestination: destinationPlace == connection.destination});
          service = null;
        }
      });
      if (service) {
        service.origin = service.stops.splice(-1, 1)[0];
        service.stops.reverse();
        route.push(service);
      }
      route.reverse();
      console.log(route);
      let time = isStopping.time;
      console.log("Will take " + time + " seconds to get there");

      document.getElementById("route-error").classList.add("d-none");
      document.getElementById("route-header").classList.remove("d-none");
      document.getElementById("time").innerText = Math.round(time);

      route.forEach((part) => {
        let partDiv = document.createElement("div");
        partDiv.classList.add("my-1");
        partDiv.classList.add("d-flex");
        let lineDiv = document.createElement("div");
        lineDiv.classList.add("d-block");
        lineDiv.classList.add("mx-1")
        lineDiv.classList.add("p-2");
        lineDiv.style.borderRadius = "10px";
        lineDiv.style.backgroundColor = "#EEEEEE";
        if (part.service && services[part.service].color) {
          lineDiv.style.backgroundColor = services[part.service].color;
        }
        partDiv.append(lineDiv);
        let textDiv = document.createElement("div");
        textDiv.classList.add("mx-2");
        textDiv.classList.add("d-block");
        textDiv.style.width = "calc(100% - 40px);"
        if (part.type === "origin") {
          let p = document.createElement("p");
          p.innerText = (part.isDestination ? `Walk to destination via Exit ${part.exit.key}: ${part.exit.name}` : `Walk to ${part.destination}`) + ` (${Math.round(part.time)} sec)`;
          textDiv.append(p);
        } else if (part.type === "transfer") {
          let p = document.createElement("p");
          p.innerText = `Transfer to ${part.destination} via Exit ${part.exit} (${Math.round(part.time)} sec)`;
          textDiv.append(p);
        } else {
          let origin = document.createElement("h4");
          origin.innerText = part.origin;
          origin.innerHTML += ` <small class="text-muted">(${Math.round(part.time)} sec)</small>`
          textDiv.append(origin);
          let service = document.createElement("h6");
          service.innerText = services[part.service].label;
          textDiv.append(service);
          let platform = document.createElement("h6");
          platform.classList.add("text-secondary")
          platform.innerText = `Platform ${part.platform} - ${part.direction}`;
          textDiv.append(platform);
          if (services[part.service].type !== "prt" && part.stops.length > 0) {
            part.stops.forEach((stop) => {
              let p = document.createElement("p");
              p.innerText = stop;
              p.classList.add("my-3");
              textDiv.append(p);
            });
          } else {
            let p = document.createElement("p");
            p.innerText = "non-stop";
            p.classList.add("my-3");
            textDiv.append(p);
          }
          let destination = document.createElement("h4");
          destination.innerText = part.destination;
          textDiv.append(destination);
        }
        partDiv.append(textDiv);
        layout.append(partDiv);
      });
    }

    output.classList.remove("d-none");
  });
});
