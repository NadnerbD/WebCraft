var vShader = " \
attribute vec3 aVertexPosition; \n\
attribute vec2 aTextureCoord; \n\
attribute vec3 aVertexColor; \n\
attribute vec3 aNormal; \n\
attribute float aSkyLight; \n\
attribute float aBlockLight; \n\
uniform mat4 uMVMatrix; \n\
uniform mat4 uPMatrix; \n\
uniform vec3 uSkyLightDir; \n\
uniform vec3 uSkyLightDiffuseColor; \n\
uniform vec3 uSkyLightAmbientColor; \n\
varying vec2 vTextureCoord; \n\
varying vec3 vVertexColor; \n\
varying vec4 vPosition; \n\
void main(void) { \n\
	vPosition = uMVMatrix * vec4(aVertexPosition, 1.0); \n\
	gl_Position = uPMatrix * vPosition; \n\
	vTextureCoord = aTextureCoord; \n\
	vec3 skyLightColor = (uSkyLightAmbientColor + max(dot(vec3(uMVMatrix * vec4(aNormal, 0.0)), uSkyLightDir), 0.0) * uSkyLightDiffuseColor) * aSkyLight; \n\
	vec3 blockLightColor =  vec3(1, 1, 1) * aBlockLight; \n\
	vVertexColor = aVertexColor * max(skyLightColor, blockLightColor); \n\
} \n\
";

var fShader = " \
#ifdef GL_ES \n\
precision highp float; \n\
#endif \n\
varying vec2 vTextureCoord; \n\
varying vec3 vVertexColor; \n\
varying vec4 vPosition; \n\
uniform sampler2D uSampler; \n\
uniform bool uEnableAlpha; \n\
void main(void) { \n\
	gl_FragColor = texture2D(uSampler, vTextureCoord) * vec4(vVertexColor, 1.0); \n\
	if(gl_FragColor.a < 0.9 || (uEnableAlpha && gl_FragColor == texture2D(uSampler, vec2(0.0, 0.0)))) \n\
		discard; \n\
	float dist = length(vec3(vPosition)); \n\
	float dens = clamp(1.0 / exp(dist * 0.005), 0.0, 1.0); \n\
	// The fog color is hardcoded here, but matches the clearColor we're using at time of writing \n\
	gl_FragColor = vec4(mix(vec3(0.0, 0.5, 1.0), vec3(gl_FragColor), dens), gl_FragColor.a); \n\
} \n\
";

function initGL(canvas) {
	try {
		var gl = canvas.getContext("experimental-webgl", {antialias: false});
	} catch (e) {
		return null;
	}
	return gl;
}


function compileShader(gl, str, type) {
	var shader = gl.createShader(type);
	gl.shaderSource(shader, str);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		alert(gl.getShaderInfoLog(shader));
		return null;
	}

	return shader;
}

function initShaders(gl) {
	var fragmentShader = compileShader(gl, fShader, gl.FRAGMENT_SHADER);
	var vertexShader = compileShader(gl, vShader, gl.VERTEX_SHADER);

	var shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert("Could not initialise shaders");
	}

	gl.useProgram(shaderProgram);

	shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
	gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

	shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aNormal");
	gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

	shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
	gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

	shaderProgram.vertexColorAttribute = gl.getAttribLocation(shaderProgram, "aVertexColor");
	gl.enableVertexAttribArray(shaderProgram.vertexColorAttribute);

	shaderProgram.vertexSkyLightAttribute = gl.getAttribLocation(shaderProgram, "aSkyLight");
	gl.enableVertexAttribArray(shaderProgram.vertexSkyLightAttribute);

	shaderProgram.vertexBlockLightAttribute = gl.getAttribLocation(shaderProgram, "aBlockLight");
	gl.enableVertexAttribArray(shaderProgram.vertexBlockLightAttribute);

	shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
	shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
	shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
	shaderProgram.alphaUniform = gl.getUniformLocation(shaderProgram, "uEnableAlpha");
	shaderProgram.skyDirUniform = gl.getUniformLocation(shaderProgram, "uSkyLightDir");
	shaderProgram.skyDifUniform = gl.getUniformLocation(shaderProgram, "uSkyLightDiffuseColor");
	shaderProgram.skyAmbUniform = gl.getUniformLocation(shaderProgram, "uSkyLightAmbientColor");

	return shaderProgram;
}

function initTexture(gl, filename) {
	var texture = gl.createTexture();
	texture.image = new Image();
	texture.image.onload = function () {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	texture.image.src = filename;
	return texture;
}

function ResPool(resConstructor) {
	var objects = new Array();
	var usage = new Array();

	this.alloc = function() {
		var id = usage.indexOf(0);
		if(id == -1) {
			id = objects.length;
			objects.push(resConstructor());
		}else{
			// this should be defined on alloc'd objects
			// to remove external refs when object is reclaimed
			objects[id].remove();
		}
		return id;
	}

	this.get = function(id) {
		usage[id] = 2;
		return objects[id];
	}

	this.decUsage = function() {
		for(var id in usage) {
			if(usage[id] > 0) usage[id] -= 1;
		}
	}

	this.poolSize = function() {
		return objects.length;
	}
}

function World(gl) {
	// must be a power of 2
	var CHUNK_WINDOW_SIZE = 64;
	var chunkWindow = new Array();
	var chunkPool = new ResPool(Object);

	this.createBuffers = function() {
		return {
			posBuffer: gl.createBuffer(),
			normalBuffer: gl.createBuffer(),
			uvBuffer: gl.createBuffer(),
			colorBuffer: gl.createBuffer(),
			skyBuffer: gl.createBuffer(),
			blockBuffer: gl.createBuffer(),
			indexBuffer: gl.createBuffer()
		};
	}
	var meshPool = new ResPool(this.createBuffers);

	var CHUNK_WIDTH_X = 16;
	var CHUNK_WIDTH_Y = 128;
	var CHUNK_WIDTH_Z = 16;
	var CHUNK_SIZE = [CHUNK_WIDTH_X, CHUNK_WIDTH_Y, CHUNK_WIDTH_Z];
	var REND_CUBE_SIZE = 16;
	var REND_CUBES_X = CHUNK_WIDTH_X / REND_CUBE_SIZE;
	var REND_CUBES_Y = CHUNK_WIDTH_Y / REND_CUBE_SIZE;
	var REND_CUBES_Z = CHUNK_WIDTH_Z / REND_CUBE_SIZE;
	var MAX_LIGHT = 15;
	var self = this;

	this.smoothLighting = true;
	this.meshPoolSize = meshPool.poolSize;
	this.chunkPoolSize = chunkPool.poolSize;

	this.entities = new Array();
	this.Entity = function (pos) {
		this.box = [0.6, 1.7, 0.6];
		this.pos = vec3.create(pos);
		this.vel = [0, 0, 0];
		this.walkForce = [0, 0, 0];
	}

	var frictCoeff = 0.7;
	var flyCoeff = 0.025;
	this.walkStrength = 31.25 / 700;
	this.jumpStrength = 31.25 / 110;
	this.tick = function () {
		// this function should be executed 32 times per second by the main loop
		for(var i = 0; i < self.entities.length; i++) {
			var ent = self.entities[i];
			if(ent.onGround) {
				vec3.scale(ent.vel, frictCoeff);
				vec3.add(ent.vel, ent.walkForce);
			}else{
				vec3.add(ent.vel, vec3.scale(vec3.create(ent.walkForce), flyCoeff));
			}
			vec3.add(ent.vel, [0, -9.8 / 320, 0]);
			ent.onGround = self.moveBox(ent.box, ent.pos, ent.vel);
		}
	}

	var chunkGenerator = new Worker('chunkGenerator.js');
	// add chunks to chunk list when we recieve them from the generator
	chunkGenerator.onmessage = function(msg) {
		var cx = msg.data[0][0];
		var cy = msg.data[0][1];
		var cz = msg.data[0][2];
		var wi = (cx & CHUNK_WINDOW_SIZE - 1) +
			(cz & CHUNK_WINDOW_SIZE - 1) * CHUNK_WINDOW_SIZE +
			(cy & CHUNK_WINDOW_SIZE - 1) * CHUNK_WINDOW_SIZE * CHUNK_WINDOW_SIZE;
		var poolId = chunkWindow[wi];
		if(poolId == undefined) {
			console.log("Chunk target was removed before chunk gen completed");
			return;
		}
		chunkPool.get(poolId).data = new Chunk(msg.data[0], msg.data[1]);
		// these updates take a massively long time for some reason
		//initLight(msg.data[0]);
	};

	function Chunk(coord, data) {
		// init locals
		var self = this;
		var coord = coord;
		var meshCount = REND_CUBES_X * REND_CUBES_Y * REND_CUBES_Z;
		var meshes = new Array(meshCount);
		var dirtyFlags = new Array(meshCount);

		this.coord = coord;
		this.data = data.data;
		this.blocks = data.blocks;
		this.skyLight = data.skyLight;
		this.blockLight = data.blockLight;

		function coToI(x, y, z) {
			return y + (z * CHUNK_WIDTH_Y + (x * CHUNK_WIDTH_Y * CHUNK_WIDTH_Z));
		}

		this.touch = function(x, y, z) {
			// takes chunk local coord and marks meshes as dirty
			var i = Math.floor(x / REND_CUBE_SIZE) +
				Math.floor(y / REND_CUBE_SIZE) * REND_CUBES_X +
				Math.floor(z / REND_CUBE_SIZE) * REND_CUBES_X * REND_CUBES_Y;
			dirtyFlags[i] = true;
		}

		this.getData = function(x, y, z, channel) {
			return self[channel][coToI(x, y, z)];
		}

		this.setData = function(x, y, z, channel, data) {
			self[channel][coToI(x, y, z)] = data;
		}

		function neighborsExist(gx, gy, gz) {
			// checks horizontal area surrounding a global REND_CUBE coord for
			// chunks within REND_CUBE_SIZE
			var y = 0;
			for(var z = -1; z < 2; z++) {
				for(var x = -1; x < 2; x++) {
					if(getChunk(
						(gx + x) * REND_CUBE_SIZE,
						(gy + y) * REND_CUBE_SIZE,
						(gz + z) * REND_CUBE_SIZE
					) == undefined)
						return false;
				}
			}
			return true;
		}

		this.getMesh = function(gx, gy, gz, world) {
			// inputs are in global REND_CUBE coords
			// convert to local REND_CUBE coords
			x = gx - coord[0] * REND_CUBES_X;
			y = gy - coord[1] * REND_CUBES_Y;
			z = gz - coord[2] * REND_CUBES_Z;

			// Check if coords are valid
			if(x < 0 || y < 0 || z < 0 || x >= REND_CUBES_X || y >= REND_CUBES_Y || z >= REND_CUBES_Z) {
				return undefined;
			}

			// get the internal index of the mesh
			var i = x + y * REND_CUBES_X + z * REND_CUBES_X * REND_CUBES_Y;

			// determine if chunk needs to be (re)generated
			if(meshes[i] == undefined || dirtyFlags[i] == true) {
				// Check if neighbors exist
				// don't generate meshes for this chunk until the neighboring chunks have been created
				if(!neighborsExist(gx, gy, gz)) return undefined;

				// this info is only needed if we're regenerating the chunk
				var gc = [coord[0] * CHUNK_WIDTH_X, coord[1] * CHUNK_WIDTH_Y, coord[2] * CHUNK_WIDTH_Z];
				var min = [x * REND_CUBE_SIZE + gc[0], y * REND_CUBE_SIZE + gc[1], z * REND_CUBE_SIZE + gc[2]];
				var bounds = {
					min: min,
					max: [min[0] + REND_CUBE_SIZE, min[1] + REND_CUBE_SIZE, min[2] + REND_CUBE_SIZE],
				};

				if(meshes[i] == undefined) {
					// try to generate the mesh, and allocate a buffer if successful
					var newMeshData = world.generateMesh(bounds);
					if(newMeshData != undefined) {
						var poolId = meshPool.alloc();
						var newMesh = meshPool.get(poolId);
						meshes[i] = poolId;
						newMesh.remove = function() {
							meshes[i] = undefined;
						}
						initObjectBuffers(gl, newMeshData, "chunk", newMesh);
					}
				}else if(dirtyFlags[i] == true) {
					// we force the update if it's dirty to avoid making holes in the world
					var newMeshData = world.generateMesh(bounds, true);
					if(newMeshData != undefined) {
						initObjectBuffers(gl, newMeshData, "chunk", meshPool.get(meshes[i]));
						dirtyFlags[i] = false;
					}
				}
			}

			// return the mesh
			return meshPool.get(meshes[i]);
		}
	}

	this.getMeshes = function(x, y, z, drawDist) {
		// inputs are in global float coords
		// convert to REND_CUBE coords
		x = Math.floor(x / REND_CUBE_SIZE);
		y = Math.floor(y / REND_CUBE_SIZE);
		z = Math.floor(z / REND_CUBE_SIZE);
		// get meshes in an expanding cubic pattern starting with those closest to the viewer
		// until drawDist (an integer radius in units of REND_CUBE_SIZE) is reached
		// a drawDist of 0 should show only the current chunk
		var meshes = [];
		// record which meshes get used in this frame
		// meshes that were not used in the last 2 frames can be reclaimed by new mesh gens
		meshPool.decUsage();
		chunkPool.decUsage();
		for(var d = 0; d <= drawDist; d++) {
			for(var dx = 0 - d; dx < 1 + d; dx++) {
				for(var dy = 0 - d; dy < 1 + d; dy++) {
					for(var dz = 0 - d; dz < 1 + d; dz++) {
						if(Math.abs(dx) == d || Math.abs(dy) == d || Math.abs(dz) == d) {
							var cx = x + dx;
							var cy = y + dy;
							var cz = z + dz;
							var chunk = getChunk(
								cx * REND_CUBE_SIZE,
								cy * REND_CUBE_SIZE,
								cz * REND_CUBE_SIZE
							);
							if(chunk != undefined) {
								var mesh = chunk.getMesh(cx, cy, cz, self);
								if(mesh != undefined) {
									meshes.push(mesh);
								}
							}
						}
					}
				}
			}
		}
		return meshes;
	}

	// the following set of functions are my terrible hax to get
	// block attributes
	function opacity(block) {
		// this attribute is used by the light propagation functions
		if(block == 18) return 3;
		return (block > 0 
			&& block != 6	// trees
			&& block != 20	// glass
		) * MAX_LIGHT;
		// water
		// leaves
	}
	function emit(block) {
		// this attribute is used by the light propagation functions
		if(block == 89) // lightstone
			return 15;
		return 0;
	}
	function solid(block) {
		// this attribute is used for drawing only
		// faces which are adjcent to solid blocks will not be drawn
		return block > 0 
			&& block != 6	// trees
			&& block != 8	// water 1
			&& block != 9	// water 2
			&& block != 10	// lava 1
			&& block != 11	// lava 2
			&& block != 18	// leaves
			&& block != 20;	// glass
	}
	function drawSelfAdj(block) {
		// this attribute is used for drawing only
		// special case for leaves
		return block == 0       // grass sides are 0, and must be drawn bordering air
			|| block == 18; // leaves
	}
	function physical(block) {
		return block > 0 && block != 6;
	}
	function getChunk(x, y, z) {
		var cx = Math.floor(x / CHUNK_WIDTH_X);
		var cy = Math.floor(y / CHUNK_WIDTH_Y);
		var cz = Math.floor(z / CHUNK_WIDTH_Z);
		if(cy != 0)
			return undefined;
		var coord = [cx, cy, cz];
		var wi = (cx & CHUNK_WINDOW_SIZE - 1) +
			(cz & CHUNK_WINDOW_SIZE - 1) * CHUNK_WINDOW_SIZE +
			(cy & CHUNK_WINDOW_SIZE - 1) * CHUNK_WINDOW_SIZE * CHUNK_WINDOW_SIZE;
		var poolId = chunkWindow[wi];
		if(poolId == undefined) {
			poolId = chunkPool.alloc();
			var cc = chunkPool.get(poolId);
			cc.data = "queued";
			cc.remove = function() {
				if(cc.data == "queued") chunkGenerator.postMessage({action: "cancel", coord: coord});
				chunkWindow[wi] = undefined;
			}
			chunkWindow[wi] = poolId;
			chunkGenerator.postMessage({action: "gen", coord: coord});
			return undefined;
		}else{
			var cc = chunkPool.get(poolId);
			if(cc.data == "queued") {
				return undefined;
			}
			var cco = cc.data.coord;
			if(!(cco[0] == coord[0] && cco[1] == coord[1] && cco[2] == coord[2])) {
				console.log("Incorrect chunk found in chunk window (req:" + coord + " found:" + cco + ")");
				cc.remove();
				return undefined;
			}
			return cc.data;
		}
	}
	function initLight(coord) {
		var ofsx = coord[0] * CHUNK_WIDTH_X;
		var ofsy = coord[1] * CHUNK_WIDTH_Y;
		var ofsz = coord[2] * CHUNK_WIDTH_Z;
		var lights = new Array();
		var y = ofsy + CHUNK_WIDTH_Y - 1;
		for(var z = ofsz; z < CHUNK_WIDTH_Z + ofsz; z++) {
			for(var x = ofsx; x < CHUNK_WIDTH_X + ofsx; x++) {
				lights.push([[x, y, z], MAX_LIGHT]);
			}
		}
		addLights(lights, 'skyLight');
	}
	function locOfs(x, size) {
		var ofs = x % size;
		if(ofs < 0)
			ofs += size;
		return ofs;
	}
	function getData(x, y, z, channel) {
		var def = (channel == 'skyLight') * MAX_LIGHT;
		var chunk = getChunk(x, y, z);
		if(!chunk)
			return def;
		return chunk.getData(locOfs(x, CHUNK_WIDTH_X), locOfs(y, CHUNK_WIDTH_Y), locOfs(z, CHUNK_WIDTH_Z), channel);
	}
	function setData(x, y, z, channel, data) {
		var chunk = getChunk(x, y, z);
		if(chunk) {
			chunk.setData(locOfs(x, CHUNK_WIDTH_X), locOfs(y, CHUNK_WIDTH_Y), locOfs(z, CHUNK_WIDTH_Z), channel, data);
			touch(x, y, z);
		}
	}
	function touch(x, y, z) {
		// touches all the blocks surrounding the specified block
		for(var ox = -1; ox <= 1; ox++) {
			for(var oy = -1; oy <= 1; oy++) {
				for(var oz = -1; oz <= 1; oz++) {
					var gc = vec3.add([x, y, z], [ox, oy, oz]);
					var chunk = getChunk(gc[0], gc[1], gc[2]);
					if(chunk)
						chunk.touch(locOfs(gc[0], CHUNK_WIDTH_X), locOfs(gc[1], CHUNK_WIDTH_Y), locOfs(gc[2], CHUNK_WIDTH_Z));
				}
			}
		}
	}
	var blockFaces = [
		[[-1, 38, 38, 38, 38, -1]], 	// grassy dirt grass sides
		[[1, 1, 1, 1, 1, 1]], 		// stone
		[[0, 3, 3, 3, 3, 2]], 		// grassy dirt
		[[2, 2, 2, 2, 2, 2]], 		// dirt
		[[16, 16, 16, 16, 16, 16]], 	// cobble
		[[4, 4, 4, 4, 4, 4]], 		// wood
		[[15], [63], [79]],		// trees
		[[17, 17, 17, 17, 17, 17]], 	// bedrock
		[[205]], [[205]],		// water
		[[239]], [[239]], 		// lava
		[[18]], 			// sand
		[[19]], 			// gravel
		[[32]],				// gold ore
		[[33]],				// iron ore
		[[34]],				// coal ore
		[
			[21, 20, 20, 20, 20, 21],	// basic log 
			[21, 116, 116, 116, 116, 21], 	// pine log
			[21, 117, 117, 117, 117, 21]	// birch log
		],
		[[52], [132], [52]],		// leaves
		[[48]],				// sponge
		[[49]],				// glass
		[[160]],			// lapis ore
		[[144]],			// lapis block
	];
	blockFaces[49] = [[37, 37, 37, 37, 37, 37]]; // obsidian
	blockFaces[89] = [[105, 105, 105, 105, 105, 105]]; // lightstone
	function faceId(block, face, data) {
		// "data" is the secondary block metadata thing in notch's chunks
		var blockData = blockFaces[block][data % blockFaces[block].length];
		return blockData[face % blockData.length];
	}
	function faceColor(block, face, biome) {
		if((block == 2 && face == 0) || block == 0 || block == 18)
			return [biome, 1, 0];
		else
			return [1, 1, 1];
	}
	function isCross(block) {
		return block == 6;
	}
	function addLights(lights, channel) {
		// lights is an array of [pos, value] pairs
		var cellStack = new Array();
		for(var light of lights) {
			var pos = light[0];
			var value = light[1];
			// can't "add" light to somewhere that's already brighter
			if(value >= getData(pos[0], pos[1], pos[2], channel)) {
				cellStack.push([pos, value]);
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
				var adjOpac = opacity(getData(adjPos[0], adjPos[1], adjPos[2], "blocks"));
				var adjValue = getData(adjPos[0], adjPos[1], adjPos[2], channel);
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
	function removeLight(pos, channel) {
		var cellStack = [pos];
		while(cellStack.length > 0) {
			var cur = cellStack.shift();
			var locLight = getData(cur[0], cur[1], cur[2], channel);
			setData(cur[0], cur[1], cur[2], channel, -1);
			for(var i in faceNormals) {
				var adjPos = vec3.add(vec3.create(cur), faceNormals[i]);
				var adjLight = getData(adjPos[0], adjPos[1], adjPos[2], channel);
				if(adjLight > 0 && adjLight < locLight)
					cellStack.push(adjPos);
				else if(adjLight == MAX_LIGHT && i == 5 && channel == "skyLight") // remove downward skyLight
					cellStack.push(adjPos);
			}
		}
		var lights = findLight(pos, channel);
		addLights(lights, channel);
	}
	function findLight(pos, channel) {
		var result = new Array();
		var cellStack = [pos];
		setData(pos[0], pos[1], pos[2], channel, 0);
		while(cellStack.length > 0) {
			var cur = cellStack.shift();
			// so far I haven't found a downside to just leaving black light at -1
			for(var i in faceNormals) {
				var adjPos = vec3.add(vec3.create(cur), faceNormals[i]);
				var adjLight = getData(adjPos[0], adjPos[1], adjPos[2], channel);
				var adjBlock = getData(adjPos[0], adjPos[1], adjPos[2], "blocks");
				if(adjLight == -1) {
					setData(adjPos[0], adjPos[1], adjPos[2], channel, 0);
					cellStack.push(adjPos);
				}else if(adjLight > 0) {
					result.push([adjPos, adjLight]);
				}
			}
		}
		return result;
	}
	function touchLight(pos, channel) {
		setData(pos[0], pos[1], pos[2], channel, 0);
		var lights = new Array();
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjValue = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			lights.push([adjPos, adjValue]);
		}
		addLights(lights, channel);
	}
	this.getBlock = function(pos) {
		return getData(pos[0], pos[1], pos[2], "blocks");
	}
	this.setBlock = function(pos, block) {
		// if we're placing a physical block, make sure it won't get the player stuck
		var plr = self.entities[0];
		if(physical(block) && colliding(plr.pos, plr.box, function(x, y, z, channel) {
			if(pos[0] == x && pos[1] == y && pos[2] == z) {
				return block;
			}else{
				return getData(x, y, z, channel);
			}
		}))
			return;
		// if there is already an emissive block here, remove it's light
		var initBlock = getData(pos[0], pos[1], pos[2], "blocks");
		if(initBlock == 7) // cannot overwrite bedrock
			return;
		if(emit(initBlock))
			removeLight(pos, "blockLight");
		setData(pos[0], pos[1], pos[2], "blocks", block);
		// if we're placing an opaque block, remove light at it's location
		if(opacity(block) > 0) {
			removeLight(pos, "skyLight");
			if(!emit(block))
				removeLight(pos, "blockLight");
		}
		// if we removed an opaque block, get light to flow in
		if(opacity(block) == 0) {
			touchLight(pos, "skyLight");
			touchLight(pos, "blockLight");
		}
		if(emit(block) > 0)
			addLights([[pos, emit(block)]], "blockLight");
	}
	// four verts per face
	var faceNormals = [
		[0, 1, 0],
		[1, 0, 0],
		[0, 0, 1],
		[-1,0, 0],
		[0, 0,-1],
		[0,-1, 0]
	];
	var faceVerts = [
		[[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]],
		[[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]],
		[[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]],

		[[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]],
		[[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]],
		[[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]
	];
	var crossNormals = [
		vec3.normalize([1, 0, -1]),
		vec3.normalize([-1, 0, 1]),
		vec3.normalize([-1, 0, -1]),
		vec3.normalize([1, 0, 1])
	];
	var crossVerts = [
		[[0, 1, 0], [1, 1, 1], [1, 0, 1], [0, 0, 0]],
		[[1, 1, 1], [0, 1, 0], [0, 0, 0], [1, 0, 1]],
		[[1, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 0]],
		[[0, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 1]]
	];
	// the same for all faces
	var faceUVs = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
	var faceVertIndices = [0, 1, 2, 0, 2, 3];
	function getVertLight(x, y, z, face, vert, channel) {
		// get the average of the light values from the four blocks in front of this vert
		// (in front of meaning in the direction of it's normal)
		var norm = faceNormals[face];
		var verts = faceVerts[face];
		var values = new Array();
		for(var ofs = 0; ofs < 4; ofs++) {
			values.push(getData(
				x + norm[0] + verts[vert][0] - verts[ofs][0],
				y + norm[1] + verts[vert][1] - verts[ofs][1],
				z + norm[2] + verts[vert][2] - verts[ofs][2],
				channel));
		}
		// prevent diagonal light leaks
		if(values[(vert + 1) % 4] == 0 && values[(vert + 3) % 4] == 0)
			values[(vert + 2) % 4] = 0;
		var value = 0;
		for(var ofs = 0; ofs < 4; ofs++)
			value += Math.pow(0.8, MAX_LIGHT - values[ofs]);
		return value / 4;
	}
	function getVertHeight(x, y, z, face, vert, block) {
		// get the maximum data value from the four blocks horizontally adjacent to this vertex
		var verts = faceVerts[face];
		if(verts[vert][1] != 1)
			throw "attempt to shift-check non-top vert";
		var height = 0;
		for(var ofs = 0; ofs < 4; ofs++) {
			var co = [
				x + verts[vert][0] - faceVerts[0][ofs][0],
				y + verts[vert][1] - faceVerts[0][ofs][1],
				z + verts[vert][2] - faceVerts[0][ofs][2]
			];
			if(getData(co[0], co[1], co[2], "blocks") != block)
				continue;
			var value = getData(co[0], co[1], co[2], "data");
			if(value > height)
				height = value;
		}
		return value;
	}
	function addFace(x, y, z, block, output, bounds, face, id, norm, vertSource, biome) {
		// inserts all face elements except for vertex lighting
		for(var index in faceVertIndices)
			output.faces.push(faceVertIndices[index] + output.vertices.length / 3);
		for(var vertIndex = 0; vertIndex < 4; vertIndex++) {
			// add vertices, shifted to current position
			var vert = vertSource[face][vertIndex];
			output.vertices.push(
				vert[0] + x - bounds.min[0], 
				vert[1] + y - bounds.min[1], 
				vert[2] + z - bounds.min[2]
			);
			// add the normals
			output.normals.push(norm[0], norm[1], norm[2]);
			// add the biome color layer
			var color = faceColor(block, face, biome);
			output.matColors.push(color[0], color[1], color[2]);
			// add uvs, shifted based on block type and face number
			var uv = faceUVs[vertIndex];
			var ofs = [(id % 16) / 16, Math.floor(id / 16) / 16];
			output.uvs.push(uv[0] / 16 + ofs[0], 1 - (uv[1] / 16 + ofs[1]));
		}
	}
	function addFluidBlock(x, y, z, block, output, bounds, biome) {
		// this adds blocks with shifted top verts (based on metadata heightmap)
		// notch's heightmap is weird, 0 is max, increases with distance to a max that varies
		for(var face in faceNormals) {
			var id = faceId(block, face, 0); // data is used for something else here
			var norm = faceNormals[face];
			var adjBlock = getData(x + norm[0], y + norm[1], z + norm[2], "blocks");
			// since fluid blocks are non-solid, we also check if we border our own liquid type
			if(solid(adjBlock) || adjBlock == block)
				continue;
			addFace(x, y, z, block, output, bounds, face, id, norm, faceVerts, biome);
			for(var vertIndex = 0; vertIndex < 4; vertIndex++) {
				// adjust vertical displacement of top vertices
				var vert = output.vertices[output.vertices.length - 4 + vertIndex];
				if(vert[1] == 1) {
					var level = getVertHeight(x, y, z, face, vertIndex, block);
					vec3.subtract(vert, level / maxFluidLevel(block));
				}
				// get the vertex lighting attributes
				if(emit(block)) {
					// emit should really only affect blocklight value
					output.skyLight.push(0);
					output.blockLight.push(Math.pow(0.8, MAX_LIGHT - emit(block)));
				}else if(self.smoothLighting) {
					output.skyLight.push(getVertLight(x, y, z, face, vertIndex, "skyLight"));
					output.blockLight.push(getVertLight(x, y, z, face, vertIndex, "blockLight"));
				}else{
					output.skyLight.push(Math.pow(0.8, MAX_LIGHT - getData(x + norm[0], y + norm[1], z + norm[2], "skyLight")));
					output.blockLight.push(Math.pow(0.8, MAX_LIGHT - getData(x + norm[0], y + norm[1], z + norm[2], "blockLight")));
				}
			}
		}
	}
	function addCross(x, y, z, block, output, bounds, biome) {
		for(var face = 0; face < 4; face++) {
			var data = getData(x, y, z, "data");
			var id = faceId(block, face, data);
			var norm = crossNormals[face];
			addFace(x, y, z, block, output, bounds, face, id, norm, crossVerts, biome);
			for(var vertIndex = 0; vertIndex < 4; vertIndex++) {
				// flat lighting for cross elements
				output.skyLight.push(Math.pow(0.8, MAX_LIGHT - getData(x, y, z, "skyLight")));
				output.blockLight.push(Math.pow(0.8, MAX_LIGHT - getData(x, y, z, "blockLight")));
			}
		}
	}
	function addBlock(x, y, z, block, output, bounds, biome) {
		var data = getData(x, y, z, "data");
		for(var face in faceNormals) {
			var id = faceId(block, face, data);
			var norm = faceNormals[face];
			var adjBlock = getData(x + norm[0], y + norm[1], z + norm[2], "blocks");
			if(solid(adjBlock) || (adjBlock == block && !drawSelfAdj(block)) || id == -1)
				continue;
			addFace(x, y, z, block, output, bounds, face, id, norm, faceVerts, biome);
			for(var vertIndex = 0; vertIndex < 4; vertIndex++) {
				// get the vertex lighting attributes
				if(emit(block)) {
					// emit should really only affect blocklight value
					output.skyLight.push(0);
					output.blockLight.push(Math.pow(0.8, MAX_LIGHT - emit(block)));
				}else if(self.smoothLighting) {
					output.skyLight.push(getVertLight(x, y, z, face, vertIndex, "skyLight"));
					output.blockLight.push(getVertLight(x, y, z, face, vertIndex, "blockLight"));
				}else{
					output.skyLight.push(Math.pow(0.8, MAX_LIGHT - getData(x + norm[0], y + norm[1], z + norm[2], "skyLight")));
					output.blockLight.push(Math.pow(0.8, MAX_LIGHT - getData(x + norm[0], y + norm[1], z + norm[2], "blockLight")));
				}
			}
		}
	}

	var biomeNoise = new SimplexNoise(1, 16);
	var MESH_TIME_PER_FRAME = 10;
	this.meshGenTime = 0;
	this.meshesGenerated = 0;
	this.generateMesh = function(bounds, force) {
		if(!(self.meshGenTime < MESH_TIME_PER_FRAME) && !force)
			return undefined;
		this.meshesGenerated++;
		startTime = new Date().getTime();
		// this will produce an "object" that can be sent to initObjectBuffers
		var output = new Object();
		output.vertices = new Array();
		output.normals = new Array();
		output.uvs = new Array();
		output.faces = new Array();
		output.skyLight = new Array();
		output.blockLight = new Array();
		output.matColors = new Array();
		output.location = bounds.min;
		output.rotation = [0, 0, 1, 0];
		output.scale = [1, 1, 1];
		for(var z = bounds.min[2]; z < bounds.max[2]; z++) {
			for(var x = bounds.min[0]; x < bounds.max[0]; x++) {
				var biome = biomeNoise.sample(x, 0, z);
				for(var y = bounds.min[1]; y < bounds.max[1]; y++) {
					var block = getData(x, y, z, "blocks");
					if(isCross(block)) {
						addCross(x, y, z, block, output, bounds);
					}else if(block > 0) {
						// second block layer for biome grass edges
						if(block == 2)
							addBlock(x, y, z, 0, output, bounds, biome);
						addBlock(x, y, z, block, output, bounds, biome);
					}
				}
			}
		}
		self.meshGenTime += new Date().getTime() - startTime;
		return output;
	}
	function stepToNextBlock(block, offset, dir) {
		// steps block based on dir and offset
		// adjusts offset for next block
		// returns distance traveled
		var shortNorm, face, lowT = 2;
		for(var i in faceNormals) {
			var norm = vec3.create(faceNormals[i]);
			var toffset = vec3.create(offset);
			// if we're not travelling toward a plane, ignore it
			if(vec3.dot(norm, dir) > 0)
				continue;
			// shift far walls out from origin
			if(vec3.dot(norm, [1, 1, 1]) < 0)
				vec3.add(toffset, norm)
			var d = vec3.dot(norm, dir);
			if(d != 0) {
				var t = -vec3.dot(norm, toffset) / d;
				if(t >= 0 && t < lowT) {
					lowT = t;
					shortNorm = norm;
					face = i;
				}
			}
		}
		// step into the next block
		vec3.subtract(block, shortNorm);
		// this assumes dir is normalized
		vec3.add(offset, vec3.scale(vec3.create(dir), lowT));
		// to the other side of the block
		vec3.add(offset, shortNorm);
		// return distance traveled
		return {len: lowT, face: face};
	}
	this.traceRay = function (start, dir, length) {
		var block = [Math.floor(start[0]), Math.floor(start[1]), Math.floor(start[2])];
		var offset = [locOfs(start[0], 1), locOfs(start[1], 1), locOfs(start[2], 1)];
		var result = {};
		var totalLen = 0;
		// will need a sub-box trace for torches and small things
		while(getData(block[0], block[1], block[2], "blocks") == 0 && totalLen < length) {
			result = stepToNextBlock(block, offset, dir);
			totalLen += result.len;
		}
		if(getData(block[0], block[1], block[2], "blocks") != 0 && totalLen < length)
			return [block, offset, result.face];
		else
			return null;
	}
	function colliding(pos, box, dataFunc) {
		if(dataFunc == undefined) dataFunc = getData;
		for(var x = Math.floor(pos[0] - box[0] / 2); x < pos[0] + box[0] / 2; x++) {
			for(var y = Math.floor(pos[1] - box[1] / 2); y < pos[1] + box[1] / 2; y++) {
				for(var z = Math.floor(pos[2] - box[2] / 2); z < pos[2] + box[2] / 2; z++) {
					if(getChunk(x, 0, z) == undefined || physical(dataFunc(x, y, z, "blocks"))) {
						return true;
					}
				}
			}
		}
		return false;
	}
	this.moveBox = function(box, pos, vel) {
		// alternative to sweepBox, using code based on Prelude to the Chambered
		// probably similar to minecraft's actual collision system
		// (also explains the lack of all angled faces in minecraft)
		// instead of using a fixed number of sub-steps per movement, we use
		// the bisection method of approximating the collision time, which should
		// have a significantly better worst-case performance
		var offset = [locOfs(box[0]), locOfs(box[1]), locOfs(box[2])];
		// funny hack that works suprisingly well in a 3d grid of cubes
		// integrate one axis at a time. This fails to allow sliding on
		// sloped surfaces, which presumably is why minecraft doesn't have any
		var hitGround = false;
		var order = colliding([vel[0] + pos[0], pos[1], pos[2]], box) ? [2, 0, 1] : [0, 2, 1];
		for(var axis of order) {
			var start = pos[axis];
			var end = start + vel[axis];
			var checkPt = vec3.create(pos);
			checkPt[axis] = end;
			var col = colliding(checkPt, box);
			if(col) {
				// note: ommitting the second condition here allows you to stick to ceilings by holding space
				// highly awesome, consider using in future :D
				if(axis == 1 && vel[axis] < 0)
					hitGround = true;
				// zero velocity in this axis
				vel[axis] = 0;
				// bisection should converge on point of collision
				do {
					var mid = (start + end) / 2;
					checkPt[axis] = mid;
					col = colliding(checkPt, box);
					if(col) {
						end = mid;
					}else{
						start = mid;
					}
				}while(Math.abs(start - end) > 0.0005);
				pos[axis] = start;
			}else{
				pos[axis] = end;
			}
		}
		return hitGround;
	}
	this.sweepBox = function (box, pos, vel) {
		// box is simply a vector indicating the size of the box
		var minLen;
		var hitNorm;
		var hitGround = false;
		var length = vec3.length(vel);
		do {
			minLen = length;
			hitNorm = undefined;
			var dir = vec3.normalize(vec3.create(vel));
			if(vec3.length(dir) == 0)
				break;
			for(var i = 0; i < faceNormals.length; i++) {
				var faceNorm = vec3.create(faceNormals[i]);
				// sweep the forward moving faces
				if(!(vec3.dot(vel, faceNorm) > 0))
					continue;
				var start = [box[0] * faceNorm[0] / 2 + pos[0], box[1] * faceNorm[1] / 2 + pos[1], box[2] * faceNorm[2] / 2 + pos[2]];
				var block = [Math.floor(start[0]), Math.floor(start[1]), Math.floor(start[2])];
				var offset = [locOfs(start[0], 1), locOfs(start[1], 1), locOfs(start[2], 1)];
				var totalLen = 0;
				while(true) {
					totalLen += stepToNextBlock(block, offset, dir).len;
					if(totalLen > length)
						break;
					// if there are any physical blocks in the square surrounding the hit point, do collision response
					for(var x = Math.floor(offset[0] - box[0] / 2); x < offset[0] + box[0] / 2; x++) {
						for(var y = Math.floor(offset[1] - box[1] / 2); y < offset[1] + box[1] / 2; y++) {
							for(var z = Math.floor(offset[2] - box[2] / 2); z < offset[2] + box[2] / 2; z++) {
								if(physical(getData(
									block[0] + !faceNorm[0] * x, 
									block[1] + !faceNorm[1] * y, 
									block[2] + !faceNorm[2] * z, 
									"blocks"))
								) {
									if(totalLen < minLen) {
										minLen = totalLen;
										hitNorm = vec3.create(faceNorm);
									}
								}
							}
						}
					}
				}
			}
			if(hitNorm) {
				// apply movement before collision
				vec3.add(pos, vec3.scale(vec3.create(dir), minLen));
				// adjust velocity
				var velMagBefore = vec3.length(vel);
				vec3.add(vel, vec3.scale(vec3.create(hitNorm), -vec3.dot(vel, hitNorm)));
				var velMagAfter = vec3.length(vel);
				// hack offset to prevent point-on-plane in next iteration
				vec3.add(pos, vec3.scale(vec3.create(hitNorm), -0.005));
				// adjust length for next cycle
				length -= minLen;
				length *= velMagAfter / velMagBefore;
				if(hitNorm[1] == -1)
					hitGround = true;
			}
		} while(hitNorm);
		// add the remaining velocity
		vec3.add(pos, vec3.scale(vec3.create(dir), minLen));
		return hitGround;
	}
}


function initObjectBuffers(gl, obj, name, out) {
	out.location = obj.location;
	out.rotation = obj.rotation;
	out.scale = obj.scale;
	out.name = name;

	gl.bindBuffer(gl.ARRAY_BUFFER, out.posBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.vertices), gl.STATIC_DRAW);
	out.posBuffer.itemSize = 3;
	out.posBuffer.numItems = obj.vertices.length / 3;

	gl.bindBuffer(gl.ARRAY_BUFFER, out.normalBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.normals), gl.STATIC_DRAW);
	out.normalBuffer.itemSize = 3;
	out.normalBuffer.numItems = obj.normals.length / 3;

	gl.bindBuffer(gl.ARRAY_BUFFER, out.uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.uvs), gl.STATIC_DRAW);
	out.uvBuffer.itemSize = 2;
	out.uvBuffer.numItems = obj.uvs.length / 2;

	gl.bindBuffer(gl.ARRAY_BUFFER, out.colorBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.matColors), gl.STATIC_DRAW);
	out.colorBuffer.itemSize = 3;
	out.colorBuffer.numItems = obj.matColors.length / 3;

	gl.bindBuffer(gl.ARRAY_BUFFER, out.skyBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.skyLight), gl.STATIC_DRAW);
	out.skyBuffer.itemSize = 1;
	out.skyBuffer.numItems = obj.skyLight.length;

	gl.bindBuffer(gl.ARRAY_BUFFER, out.blockBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.blockLight), gl.STATIC_DRAW);
	out.blockBuffer.itemSize = 1;
	out.blockBuffer.numItems = obj.blockLight.length;

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, out.indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(obj.faces), gl.STATIC_DRAW);
	out.indexBuffer.itemSize = 1;
	out.indexBuffer.numItems = obj.faces.length;

	return out;
} 

function mvPushMatrix(mvMatrixStack, mvMatrix) {
	var copy = mat4.create();
	mat4.set(mvMatrix, copy);
	mvMatrixStack.push(copy);
}

function mvPopMatrix(mvMatrixStack) {
	if (mvMatrixStack.length == 0) {
		throw "Invalid popMatrix!";
	}
	return mvMatrixStack.pop();
}

function degToRad(degrees) {
	return degrees * Math.PI / 180;
}

function eulerToMat(euler) {
	mat = mat4.create();
	mat4.identity(mat);
	mat4.rotate(mat, degToRad(euler[0]), [1, 0, 0]);
	mat4.rotate(mat, degToRad(euler[1]), [0, 1, 0]);
	mat4.rotate(mat, degToRad(euler[2]), [0, 0, 1]);
	return mat;
}

function drawScene(gl, shaderProgram, textures, model, camPos, camRot, sky) {
	// if the canvas display size changes, change the canvas image size to match
	var canvas = gl.canvas;
	var dw = canvas.clientWidth;
	var dh = canvas.clientHeight;
	if(canvas.width != dw || canvas.height != dh) {
		canvas.width = dw;
		canvas.height = dh;
	}

	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
	gl.clearColor(0.0, 0.5, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	var pMatrix = mat4.create();
	mat4.perspective(70, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 256.0, pMatrix);
	gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
	
	var mvMatrixStack = [];
	var mvMatrix = mat4.create();
	mat4.identity(mvMatrix);

	mat4.rotate(mvMatrix, degToRad(camRot[0]), [1, 0, 0]);
	mat4.rotate(mvMatrix, degToRad(camRot[1]), [0, 1, 0]);
	mat4.rotate(mvMatrix, degToRad(camRot[2]), [0, 0, 1]);
	mat4.translate(mvMatrix, vec3.subtract(vec3.create(), camPos));

	for(var tex in textures) {
		gl.activeTexture(gl["TEXTURE" + tex]);
		gl.bindTexture(gl.TEXTURE_2D, textures[tex]);
	}

	gl.uniform1i(shaderProgram.alphaUniform, false);
	gl.uniform3fv(shaderProgram.skyDirUniform, vec3.create(mat4.multiplyVec4(mvMatrix, [sky[0][0], sky[0][1], sky[0][2], 0])));
	gl.uniform3fv(shaderProgram.skyDifUniform, sky[1]);
	gl.uniform3fv(shaderProgram.skyAmbUniform, sky[2]);

	for(var i in model) {
		if(model[i].name == "chunk") {
			gl.enable(gl.CULL_FACE);
			gl.uniform1i(shaderProgram.samplerUniform, 0);
		}else if(model[i].name == "selector") {
			gl.disable(gl.CULL_FACE);
			gl.uniform1i(shaderProgram.samplerUniform, 2);
			gl.lineWidth(2);
		}else if(model[i].name == "item") {
			gl.uniform1i(shaderProgram.samplerUniform, 1);
		}else if(model[i].name == "crosshair") {
			gl.disable(gl.CULL_FACE);
			gl.uniform1i(shaderProgram.samplerUniform, 2);
		}

		mvPushMatrix(mvMatrixStack, mvMatrix);

		if(model[i].name == "crosshair") {
			mat4.identity(mvMatrix);
			gl.disable(gl.DEPTH_TEST);
		}else{
			gl.enable(gl.DEPTH_TEST);
		}

		mat4.translate(mvMatrix, model[i].location);
		mat4.rotate(mvMatrix, model[i].rotation[0], [model[i].rotation[1], model[i].rotation[2], model[i].rotation[3]]); 
		mat4.scale(mvMatrix, model[i].scale);

		gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);

		gl.bindBuffer(gl.ARRAY_BUFFER, model[i].posBuffer);
		gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, model[i].posBuffer.itemSize, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, model[i].normalBuffer);
		gl.vertexAttribPointer(shaderProgram.vertexNormalAttribute, model[i].normalBuffer.itemSize, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, model[i].uvBuffer);
		gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, model[i].uvBuffer.itemSize, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, model[i].colorBuffer);
		gl.vertexAttribPointer(shaderProgram.vertexColorAttribute, model[i].colorBuffer.itemSize, gl.FLOAT, false, 0, 0);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, model[i].skyBuffer);
		gl.vertexAttribPointer(shaderProgram.vertexSkyLightAttribute, model[i].skyBuffer.itemSize, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, model[i].blockBuffer);
		gl.vertexAttribPointer(shaderProgram.vertexBlockLightAttribute, model[i].blockBuffer.itemSize, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model[i].indexBuffer);

		if(model[i].name == "selector") {
			gl.drawElements(gl.LINES, model[i].indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
		}else{
			gl.drawElements(gl.TRIANGLES, model[i].indexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
		}

		mvMatrix = mvPopMatrix(mvMatrixStack);
	}
}

function main() {
	var canvas = document.createElement("canvas");
	canvas.width = 1024;
	canvas.height = 768;
	var gl = initGL(canvas);
	if(!gl)
		return null;
	var shaderProgram = initShaders(gl);
	//var skinTexture = initTexture(gl, filename);
	var terrainTexture = initTexture(gl, "terrain.png");
	var itemTexture = initTexture(gl, "items.png");
	var crossTexture = initTexture(gl, "crosshair.png");

	var world = new World(gl);

	var selector = {
		vertices: [0, 0, 0,  1, 0, 0,  0, 1, 0,  1, 1, 0,  0, 0, 1,  1, 0, 1,  0, 1, 1,  1, 1, 1],
		matColors: [0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0],
		normals: [0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0],
		uvs: [0.5, 0.5,  0.5, 0.5,  0.5, 0.5,  0.5, 0.5,  0.5, 0.5,  0.5, 0.5,  0.5, 0.5,  0.5, 0.5],
		faces: [0, 1,  0, 2,  0, 4,  1, 3,  1, 5,  2, 3,  2, 6,  3, 7,  4, 5,  4, 6,  5, 7,  6, 7],
		skyLight: [0, 0, 0, 0, 0, 0, 0, 0],
		blockLight: [0, 0, 0, 0, 0, 0, 0, 0],
		location: [0, 0, 0],
		rotation: [0, 0, 1, 0],
		scale: [1.01, 1.01, 1.01]
	};
	var selectorBuffers = new Array();
	selectorBuffers.push(initObjectBuffers(gl, selector, "selector", world.createBuffers()));
	selector.scale = [0.01, 0.01, 0.01];
	selectorBuffers.push(initObjectBuffers(gl, selector, "selector", world.createBuffers()));

	var crosshair = {
		vertices: [-1, -1, 0,  1, -1, 0,  1, 1, 0,  -1, 1, 0],
		matColors: [1, 1, 1,  1, 1, 1,  1, 1, 1,  1, 1, 1],
		normals: [0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1],
		uvs: [0, 0,  1, 0,  1, 1,  0, 1],
		faces: [0, 1, 2,  0, 2, 3],
		skyLight: [0, 0, 0, 0],
		blockLight: [1, 1, 1, 1],
		location: [0, 0, -1],
		rotation: [0, 0, 1, 0],
		scale: [0.025, 0.025, 0.025]
	};
	var crosshairBuffer = initObjectBuffers(gl, crosshair, "crosshair", world.createBuffers());

	/*model.push(initObjectBuffers(gl, Mesh.Head, "head"));
	model.push(initObjectBuffers(gl, Mesh.Mask, "mask"));
	model.push(initObjectBuffers(gl, Mesh.Body, "body"));
	model.push(initObjectBuffers(gl, Mesh.ArmLeft, "arml"));
	model.push(initObjectBuffers(gl, Mesh.ArmRight, "armr"));
	model.push(initObjectBuffers(gl, Mesh.LegLeft, "legl"));
	model.push(initObjectBuffers(gl, Mesh.LegRight, "legr"));
	model.push(initObjectBuffers(gl, Mesh.Item, "item"));*/

	var sky = [
		vec3.create([0.707, -0.707, 0]), // direction
		vec3.create([1, 0.5, 0]), // diffuse
		vec3.create([1, 1, 1]) //vec3.create([0.2, 0.2, 0.5]) // ambient
	];

	//var camPos = [-20, 50, 30];
	world.entities[0] = new world.Entity([8, 130, 8]);
	var camRot = [45, 45, 0];

	// number of chunks from the current chunk to display
	var DRAW_DIST = 7;
	var distSelector = document.getElementById('drawDist');
	for(var i = 1; i <= 16; i++) {
		var elem = document.createElement("option");
		elem.value = i;
		elem.innerText = i;
		distSelector.appendChild(elem);
	}
	distSelector.value = DRAW_DIST;
	distSelector.onchange = function() {
		DRAW_DIST = parseInt(distSelector.value);
	}

	function lookFunc(event) {
		var delta = [event.movementX || event.mozMovementX || 0, event.movementY || event.mozMovementY || 0];
		camRot[1] += delta[0] * 0.25;
		camRot[0] += delta[1] * 0.25;
		if(camRot[0] > 90)
			camRot[0] = 90;
		if(camRot[0] < -90)
			camRot[0] = -90;
		lastMousePos = [event.clientX, event.clientY];
	}

	// prepare the pointer lock functions
	canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
	document.addEventListener('click', function(event) {
		canvas.requestPointerLock();
	}, false);
	// enable and disable mouse tracking
	function lockChange() {
		if(document.pointerLockElement === canvas ||
		document.mozPointerLockElement === canvas) {
			document.addEventListener('mousemove', lookFunc, false);
			document.addEventListener('mouseup', clickFunc, false);
		}else{
			document.removeEventListener('mousemove', lookFunc, false);
			document.removeEventListener('mouseup', clickFunc, false);
		}
	}
	// mozilla hasn't made this standard yet
	document.addEventListener('pointerlockchange', lockChange, false);
	document.addEventListener('mozpointerlockchange', lockChange, false);

	function clickFunc(event) {
		switch(event.button) {
			case 0: // left button
				if(selectedBlock) {
					world.setBlock(selectedBlock[0], 0);
				}
				break;
			case 1: // middle button
				if(selectedBlock) {
					document.getElementById("blockType").value = world.getBlock(selectedBlock[0]);
				}
				break;
			case 2: // right button
				// do we have a selection *and* a face
				if(selectedBlock && selectedBlock[2]) {
					var faceNormals = [
						[0, 1, 0],
						[1, 0, 0],
						[0, 0, 1],
						[-1,0, 0],
						[0, 0,-1],
						[0,-1, 0]
					];
					world.setBlock(
						vec3.add(
							selectedBlock[0],
							faceNormals[selectedBlock[2]]
						),
						document.getElementById("blockType").value
					);
				}
				break;
		}
	}

	document.addEventListener('wheel', function(event) {
		var options = document.getElementById("blockType");
		if(event.deltaY > 0) {
			if(options.children[options.selectedIndex + 1])
				options.value = options.children[options.selectedIndex + 1].value;
		}else if(event.deltaY < 0) {
			if(options.children[options.selectedIndex - 1])
				options.value = options.children[options.selectedIndex - 1].value;
		}
	}, false);

	var moveDir = [0, 0, 0];
	document.addEventListener('keydown', function(event) {
		switch(event.keyCode) {
		case 87: // 87 w
			moveDir[2] = 1;
			break;
		case 65: // 65 a
			moveDir[0] = 1;
			break;
		case 83: // 83 s
			moveDir[2] = -1;
			break;
		case 68: // 68 d
			moveDir[0] = -1;
			break;
		case 32: // space
			moveDir[1] = 1;
			break;
		default:
			//alert(event.keyCode);
			break;
		}
	}, false);

	document.addEventListener('keyup', function(event) {
		switch(event.keyCode) {
		case 87: // 87 w
		case 83: // 83 s
			moveDir[2] = 0;
			break;
		case 65: // 65 a
		case 68: // 68 d
			moveDir[0] = 0;
			break;
		case 32: // space
			moveDir[1] = 0;
			break;
		}
	}, false);

	var tickLen = 31.25;
	var lastTime = 0;
	var timeSamples = new Array(30);
	var timeIndex = 0;
	var dayRot = 0;
	var selectedBlock = null;
	var gameTime = new Date().getTime();
	var lastPos = [vec3.create([0, 0, 0])];
	var displayPos = [vec3.create([0, 0, 0])];

	setInterval(function() {
		var dirs = eulerToMat(camRot);
		selectedBlock = world.traceRay(vec3.add([0, 0.65, 0], displayPos[0]), [-dirs[2], -dirs[6], -dirs[10]], 20);
		// update the HUD
		document.getElementById("selBlock").innerText = selectedBlock ? selectedBlock[0] : "";
		document.getElementById("meshPoolSize").innerText = world.meshPoolSize();
		document.getElementById("chunkPoolSize").innerText = world.chunkPoolSize();

		var camPos = vec3.add([0, 0.65, 0], displayPos[0]);
		world.meshGenTime = 0;
		world.meshesGenerated = 0;

		var model = world.getMeshes(
			displayPos[0][0],
			displayPos[0][1],
			displayPos[0][2],
			DRAW_DIST
		);

		// change the position of the selector
		if(selectedBlock) {
			selectorBuffers[0].location = vec3.subtract(vec3.create(selectedBlock[0]), [0.005, 0.005, 0.005]);
			selectorBuffers[1].location = vec3.subtract(vec3.add(vec3.create(selectedBlock[0]), selectedBlock[1]), [0.005, 0.005, 0.005]);
			model = model.concat(selectorBuffers);
		}

		model = model.concat([crosshairBuffer]);

		drawScene(gl, shaderProgram, [terrainTexture, itemTexture, crossTexture], model, camPos, camRot, sky);

		var timeNow = new Date().getTime();
		if(lastTime != 0) {
			var elapsed = timeNow - lastTime;
			timeSamples[timeIndex] = elapsed;
			timeIndex = (timeIndex + 1) % timeSamples.length;
			var sum = 0;
			var max = 0;
			for(var sample of timeSamples) {
				sum += sample;
				if(sample > max) max = sample;
			}
			var average = sum / timeSamples.length;

			// update the framerate counter
			document.getElementById("fpsCount").innerText = Math.floor(1000 / average) + " min: " + Math.floor(1000 / max);

			dayRot += elapsed / 5000 * Math.PI;
			sky[0] = vec3.create([Math.sin(dayRot), Math.cos(dayRot), 0]);
		
			// set the player walk force
			var dirs = eulerToMat([0, camRot[1], 0]);
			var vel = vec3.add(
				vec3.scale([-dirs[2], -dirs[6], -dirs[10]], moveDir[2]), 
				vec3.scale([-dirs[0], -dirs[4], -dirs[8]], moveDir[0])
			);
			vec3.scale(vec3.normalize(vel), world.walkStrength);
			vec3.add(vel, [0, moveDir[1] * world.jumpStrength, 0]);
			world.entities[0].walkForce = vel;
			
			// progress the simulation to the current time
			var currentTime = new Date().getTime();
			while(gameTime < currentTime) {
				lastPos = [];
				for(var ent of world.entities) {
					lastPos.push(vec3.create(ent.pos));
				}
				world.tick();
				gameTime += tickLen;
				if(currentTime - gameTime > 2000) {
					console.log("can't keep up");
					gameTime = currentTime;
				}
			}
			displayPos = [];
			for(var ent in world.entities) {
				// gameTime can be greater than currentTime by up to one tick length
				var blend = (gameTime - currentTime) / tickLen;
				var diff = vec3.subtract(vec3.create(lastPos[ent]), world.entities[ent].pos);
				var interp = vec3.add(vec3.create(world.entities[ent].pos), vec3.scale(diff, blend));
				displayPos.push(interp);
			}
		}
		lastTime = timeNow;
	}, 15);

	return canvas;
}
