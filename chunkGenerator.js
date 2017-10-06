importScripts("simplex.js", "glMatrix-0.9.5.min.js", "pako.min.js");

// 6 octaves, max feature size of 128
var terrainNoise = new SimplexNoise(6, 128);
var CHUNK_WIDTH_X = 16;
var CHUNK_WIDTH_Y = 128;
var CHUNK_WIDTH_Z = 16;
var CHUNK_SIZE = [CHUNK_WIDTH_X, CHUNK_WIDTH_Y, CHUNK_WIDTH_Z];
var MAX_LIGHT = 15;

function Chunk(coord) {
	var self = this;
	// this is a subset of the Chunk object as used in minecraft.js
	// it does not add function members as the real article does, because
	// function objects cannot be transferred through postMessage
	this.coord = coord;
	this.data = new Array(chunkLen);
	this.blocks = new Array(chunkLen);
	this.skyLight = new Array(chunkLen);
	this.blockLight = new Array(chunkLen);

	var chunkLen = CHUNK_WIDTH_X * CHUNK_WIDTH_Y * CHUNK_WIDTH_Z;

	function coToI(x, y, z) {
		return y + (z * CHUNK_WIDTH_Y + (x * CHUNK_WIDTH_Y * CHUNK_WIDTH_Z));
	}

	function inBounds(x, y, z) {
		return 	x < CHUNK_WIDTH_X &&
			y < CHUNK_WIDTH_Y &&
			z < CHUNK_WIDTH_Z &&
			x >= 0 &&
			y >= 0 &&
			z >= 0;
	}

	function getData(x, y, z, channel, def) {
		if(inBounds(x, y, z))
			return self[channel][coToI(x, y, z)];
		else
			return def;
	}

	function setData(x, y, z, channel, value) {
		if(inBounds(x, y, z))
			self[channel][coToI(x, y, z)] = value;
	}

	function opacity(block) {
		// this attribute is used by the light propagation functions
		return (block > 0 
			&& block != 6	// trees
			&& block != 20	// glass
		) * MAX_LIGHT;
		// water
		// leaves
	}

	var faceNormals = [
		[0, 1, 0],
		[1, 0, 0],
		[0, 0, 1],
		[-1,0, 0],
		[0, 0,-1],
		[0,-1, 0]
	];

	function addLights(lights, channel) {
		// lights is an array of [pos, value] pairs
		var cellStack = new Array();
		for(var light in lights) {
			var pos = lights[light][0];
			var value = lights[light][1];
			if(value >= getData(pos[0], pos[1], pos[2], channel, MAX_LIGHT)) {
				cellStack.push([pos, value]); // can't "add" light to somewhere that's already brighter
				setData(pos[0], pos[1], pos[2], channel, value);
			}
		}
		// breadth first search fill to minimize wasted writes
		while(cellStack.length > 0) {
			var cur = cellStack.shift();
			pos = cur[0];
			value = cur[1];
			for(var i in faceNormals) {
				var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
				var adjOpac = opacity(getData(adjPos[0], adjPos[1], adjPos[2], "blocks", 0));
				var adjValue = getData(adjPos[0], adjPos[1], adjPos[2], channel, MAX_LIGHT);
				var nextValue = value - adjOpac - 1;
				if(adjOpac == 0 && i == 5 && value == MAX_LIGHT && channel == "skyLight" && value > adjValue) {
					nextValue = value;
					cellStack.unshift([adjPos, nextValue]); // descending skyLight goes to the front of the queue
				} else if(nextValue > adjValue) {
					cellStack.push([adjPos, nextValue]);
				} else {
					continue;
				}
				// set the target light level to prevent other blocks from queueing the same update
				setData(adjPos[0], adjPos[1], adjPos[2], channel, nextValue);
			}
		}
	}

	for(var x = 0; x < CHUNK_WIDTH_X; x++) {
		var globx = x + coord[0] * CHUNK_WIDTH_X;
		for(var y = 0; y < CHUNK_WIDTH_Y; y++) {
			var globy = y + coord[1] * CHUNK_WIDTH_Y;
			for(var z = 0; z < CHUNK_WIDTH_Z; z++) {
				var globz = z + coord[2] * CHUNK_WIDTH_Z;
				var blockValue = terrainNoise.sample(globx, globy, globz) - ((globy - 64) / 256) > 0.5;
				this.data[coToI(x, y, z)] = 0; // metadata value
				this.blocks[coToI(x, y, z)] = blockValue * 1; // stone
				this.skyLight[coToI(x, y, z)] = 0; //!blockValue * MAX_LIGHT;
				this.blockLight[coToI(x, y, z)] = 0;
			}
		}
	}

	var lights = new Array();
	for(var x = 0; x < CHUNK_WIDTH_X; x++) {
		for(var z = 0; z < CHUNK_WIDTH_Z; z++) {
			var depth = 0;
			for(var y = CHUNK_WIDTH_Y - 1; y >= 0; y--) {
				var block = this.blocks[coToI(x, y, z)];
				if(block == 0) {
					depth = 0;
					if(y == CHUNK_WIDTH_Y - 1)
						lights.push([[x, y, z], MAX_LIGHT]);
				}else{
					depth++;
				}
				if(depth == 1)
					this.blocks[coToI(x, y, z)] = 2; // grassy dirt
				if(depth > 1 && depth <= 4)
					this.blocks[coToI(x, y, z)] = 3; // dirt
				if(y == 0)
					this.blocks[coToI(x, y, z)] = 7; // bedrock
			}
		}
	}
	addLights(lights, 'skyLight');
}

// produce a chunk for a given coordinate on demand
var chunkQueue = new Array();
var changeBatch = new Object();

self.onmessage = function (msg) {
	var d = msg.data;
	var a = d.action;
	var c = d.coord;
	if(a == "gen") {
		// ignore duplicate requests
		for(var i of chunkQueue) {
			if(i[0] == c[0] && i[1] == c[1] && i[2] == c[2]) return;
		}
		// check if the server has a copy of the chunk
		var req = new XMLHttpRequest();
		req.open("GET", "chunks/chunk_" + c[0] + "_" + c[1] + "_" + c[2] + ".json.gz?" + new Date().getTime());
		req.onreadystatechange = function() {
			if(req.readyState != req.DONE) return;
			if(req.status == 200) {
				// we found a chunk!
				postMessage(JSON.parse(req.responseText));
			}else{
				// not found, generate it ourselves
				chunkQueue.push(c);
			}
		}
		req.send();
	}else if(a == "cancel") {
		// remove the coord from the queue
		for(var i of chunkQueue) {
			if(i[0] == c[0] && i[1] == c[1] && i[2] == c[2]) chunkQueue.splice(chunkQueue.indexOf(i), 1);
		}
	}else if(a == "edit") {
		if(!changeBatch[d.chunk]) changeBatch[d.chunk] = {};
		if(!changeBatch[d.chunk][d.channel]) changeBatch[d.chunk][d.channel] = [];
		changeBatch[d.chunk][d.channel].push([d.index, d.value]);
	}
}

function produceChunk() {
	if(chunkQueue.length) {
		var coord = chunkQueue.shift();
		var chunk = new Chunk(coord);
		postMessage(chunk);
		// if we generated the chunk, send it to the server
		var req = new XMLHttpRequest();
		req.open("POST", "save_chunk");
		req.setRequestHeader("X-Coord", JSON.stringify(chunk.coord));
		req.setRequestHeader("Content-Encoding", "gzip");
		req.send(pako.gzip(JSON.stringify(chunk)));
	}
}

function sendChanges() {
	/*
	if(Object.keys(changeBatch).length != 0) {
		var req = new XMLHttpRequest();
		req.open("POST", "edit_chunks");
		req.setRequestHeader("Content-Encoding", "gzip");
		req.send(pako.gzip(JSON.stringify(changeBatch)));
		changeBatch = new Object();
	}
	*/
}

setInterval(produceChunk, 0);
setInterval(sendChanges, 60);
