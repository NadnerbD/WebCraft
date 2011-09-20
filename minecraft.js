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
void main(void) { \n\
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0); \n\
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
uniform sampler2D uSampler; \n\
uniform bool uEnableAlpha; \n\
void main(void) { \n\
	gl_FragColor = texture2D(uSampler, vec2(vTextureCoord.s, vTextureCoord.t)) * vec4(vVertexColor, 1.0); \n\
	if(gl_FragColor.a < 0.9 || (uEnableAlpha && gl_FragColor == texture2D(uSampler, vec2(0.0, 0.0)))) \n\
		discard; \n\
} \n\
";

function initGL(canvas) {
	try {
		var gl = canvas.getContext("experimental-webgl");
		gl.viewportWidth = canvas.width;
		gl.viewportHeight = canvas.height;
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
	var skinTexture = gl.createTexture();
	skinTexture.image = new Image();
	skinTexture.image.onload = function () {
		gl.bindTexture(gl.TEXTURE_2D, skinTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skinTexture.image);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	skinTexture.image.src = filename;
	return skinTexture;
}


function World(gl) {
	//var chunks = new Array();
	var dirtyChunks = new Array();
	var CHUNK_WIDTH_X = 16;
	var CHUNK_WIDTH_Y = 128;
	var CHUNK_WIDTH_Z = 16;
	var CHUNK_SIZE = [CHUNK_WIDTH_X, CHUNK_WIDTH_Y, CHUNK_WIDTH_Z];
	var MAX_LIGHT = 15;
	var self = this;

	this.smoothLighting = true;

	this.entities = new Array();
	this.Entity = function (pos) {
		this.box = [0.6, 1.7, 0.6];
		this.pos = vec3.create(pos);
		this.vel = [0, 0, 0];
		this.walkForce = [0, 0, 0];
	}
	var frictCoeff = 0.025;
	var flyCoeff = 0.025;
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
			ent.onGround = self.sweepBox(ent.box, ent.pos, ent.vel);
		}
	}

	function Chunk(coord) {
		this.coord = coord;
		this.mesh = null;
		this.data = new Array();
		this.blocks = new Array();
		this.skyLight = new Array();
		this.blockLight = new Array();
		for(var x = 0; x < CHUNK_WIDTH_X; x++) {
			for(var y = 0; y < CHUNK_WIDTH_Y; y++) {
				for(var z = 0; z < CHUNK_WIDTH_Z; z++) {
					var blockValue = Math.sin(x * Math.PI / 5) + Math.sin(z * Math.PI / 5) > (y - 20) / 5 
						&& x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < 128;
					this.data[coToI(x, y, z)] = 0; // metadata value
					this.blocks[coToI(x, y, z)] = blockValue * 1; // stone
					this.skyLight[coToI(x, y, z)] = !blockValue * MAX_LIGHT;
					this.blockLight[coToI(x, y, z)] = 0;
				}
			}
		}
		for(var x = 0; x < CHUNK_WIDTH_X; x++) {
			for(var z = 0; z < CHUNK_WIDTH_Z; z++) {
				var depth = 0;
				for(var y = CHUNK_WIDTH_Y - 1; y >= 0; y--) {
					if(this.blocks[coToI(x, y, z)] != 0)
						depth++;
					if(depth == 1)
						this.blocks[coToI(x, y, z)] = 2; // grassy dirt
					if(depth > 1 && depth <= 4)
						this.blocks[coToI(x, y, z)] = 3; // dirt
					if(y == 0)
						this.blocks[coToI(x, y, z)] = 7; // bedrock
				}
			}
		}
	}

	/* temporary chunk generation code */
	chunks[0] = new Array();
	chunks[0][0] = new Array();
	chunks[0][0][0] = new Chunk(0);
	chunks[0][0][1] = new Chunk(1);
	chunks[0][0][2] = new Chunk(2);
	chunks[1] = new Array();
	chunks[1][0] = new Array();
	chunks[1][0][0] = new Chunk(3);
	chunks[1][0][1] = new Chunk(4);
	chunks[1][0][2] = new Chunk(5);
	chunks[2] = new Array();
	chunks[2][0] = new Array();
	chunks[2][0][0] = new Chunk(6);
	chunks[2][0][1] = new Chunk(7);
	chunks[2][0][2] = new Chunk(8);
	/* end temp chunk gen code */

	// the following set of functions are my terrible hax to get
	// block attributes
	function opacity(block) {
		// this attribute is used by the light propagation functions
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
		return block != 18; // leaves
	}
	function physical(block) {
		return block > 0 && block != 6;
	}
	function getChunk(x, y, z) {
		var row = chunks[Math.floor(x / CHUNK_WIDTH_X)];
		if(!row)
			return null;
		var layer = row[Math.floor(y / CHUNK_WIDTH_Y)];
		if(!layer)
			return null;
		var chunk = layer[Math.floor(z / CHUNK_WIDTH_Z)];
		if(!chunk)
			return null;
		return chunk;
	}
	function coToI(x, y, z) {
		return y + (z * CHUNK_WIDTH_Y + (x * CHUNK_WIDTH_Y * CHUNK_WIDTH_Z));
	}
	function getData(x, y, z, channel) {
		var def = (channel == 'skyLight') * MAX_LIGHT;
		var chunk = getChunk(x, y, z);
		if(!chunk)
			return def;
		return chunk[channel][coToI(x % CHUNK_WIDTH_X, y % CHUNK_WIDTH_Y, z % CHUNK_WIDTH_Z)];
	}
	function setData(x, y, z, channel, data) {
		var chunk = getChunk(x, y, z);
		if(chunk) {
			chunk[channel][coToI(x % CHUNK_WIDTH_X, y % CHUNK_WIDTH_Y, z % CHUNK_WIDTH_Z)] = data;
			dirtyChunks[chunk.coord] = chunk;
		}
	}
	this.flushMeshes = function () {
		for(var i in dirtyChunks) {
			var chunk = dirtyChunks[i];
			self.generateMesh({min: chunk.mesh.location, max: vec3.add(vec3.create(CHUNK_SIZE), chunk.mesh.location)});
		}
		dirtyChunks = new Array();
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
	blockFaces[89] = [[105, 105, 105, 105, 105, 105]]; // lightstone
	function faceId(block, face, data) {
		// "data" is the secondary block metadata thing in notch's chunks
		var blockData = blockFaces[block][data % blockFaces[block].length];
		return blockData[face % blockData.length];
	}
	function faceColor(block, face) {
		if((block == 2 && face == 0) || block == 0)
			return [0.5, 1, 0];
		else
			return [1, 1, 1];
	}
	function isCross(block) {
		return block == 6;
	}
	function addLight(pos, value, channel) {
		setData(pos[0], pos[1], pos[2], channel, value);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjOpac = opacity(getData(adjPos[0], adjPos[1], adjPos[2], "blocks"));
			var adjValue = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			var nextValue = value - adjOpac - 1;
			if(adjOpac == 0 && i == 5 && value == MAX_LIGHT && channel == "skyLight")
				nextValue = value;
			if(nextValue > adjValue)
				addLight(adjPos, nextValue, channel);
		}
	}
	function removeLight(pos, channel, notFirst) {
		var locLight = getData(pos[0], pos[1], pos[2], channel);
		setData(pos[0], pos[1], pos[2], channel, -1);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjLight = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			if(adjLight > 0 && adjLight < locLight)
				removeLight(adjPos, channel, 1);
			else if(adjLight == MAX_LIGHT && i == 5 && channel == "skyLight") // remove downward skyLight
				removeLight(adjPos, channel, 1);
		}
		if(!notFirst) {
			var lights = findLight(pos, channel);
			for(var i in lights) {
				addLight(lights[i][0], lights[i][1], channel);
			}
		}
	}
	function findLight(pos, channel, result) {
		if(!result)
			result = new Array();
		// so far I haven't found a downside to just leaving black light at -1
		setData(pos[0], pos[1], pos[2], channel, 0);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjLight = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			var adjBlock = getData(adjPos[0], adjPos[1], adjPos[2], "blocks");
			if(adjLight == -1) {
				findLight(adjPos, channel, result);	
			}else if(adjLight > 0) {
				result.push([adjPos, adjLight]);
			}
		}
		return result;
	}
	function touchLight(pos, channel) {
		setData(pos[0], pos[1], pos[2], channel, 0);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjValue = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			addLight(adjPos, adjValue, channel);
		}
	}
	this.setBlock = function(pos, block) {
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
			addLight(pos, emit(block), "blockLight");
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
	function addFace(x, y, z, block, output, bounds, face, id, norm, vertSource) {
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
			var color = faceColor(block, face);
			output.matColors.push(color[0], color[1], color[2]);
			// add uvs, shifted based on block type and face number
			var uv = faceUVs[vertIndex];
			var ofs = [(id % 16) / 16, Math.floor(id / 16) / 16];
			output.uvs.push(uv[0] / 16 + ofs[0], 1 - (uv[1] / 16 + ofs[1]));
		}
	}
	function addFluidBlock(x, y, z, block, output, bounds) {
		// this adds blocks with shifted top verts (based on metadata heightmap)
		// notch's heightmap is weird, 0 is max, increases with distance to a max that varies
		for(var face in faceNormals) {
			var id = faceId(block, face, 0); // data is used for something else here
			var norm = faceNormals[face];
			var adjBlock = getData(x + norm[0], y + norm[1], z + norm[2], "blocks");
			// since fluid blocks are non-solid, we also check if we border our own liquid type
			if(solid(adjBlock) || adjBlock == block)
				continue;
			addFace(x, y, z, block, output, bounds, face, id, norm, faceVerts);
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
	function addCross(x, y, z, block, output, bounds) {
		for(var face = 0; face < 4; face++) {
			var data = getData(x, y, z, "data");
			var id = faceId(block, face, data);
			var norm = crossNormals[face];
			addFace(x, y, z, block, output, bounds, face, id, norm, crossVerts);
			for(var vertIndex = 0; vertIndex < 4; vertIndex++) {
				// flat lighting for cross elements
				output.skyLight.push(Math.pow(0.8, MAX_LIGHT - getData(x, y, z, "skyLight")));
				output.blockLight.push(Math.pow(0.8, MAX_LIGHT - getData(x, y, z, "blockLight")));
			}
		}
	}
	function addBlock(x, y, z, block, output, bounds) {
		for(var face in faceNormals) {
			var data = getData(x, y, z, "data");
			var id = faceId(block, face, data);
			var norm = faceNormals[face];
			var adjBlock = getData(x + norm[0], y + norm[1], z + norm[2], "blocks");
			if(solid(adjBlock) || (drawSelfAdj(block) && adjBlock == block) || id == -1)
				continue;
			addFace(x, y, z, block, output, bounds, face, id, norm, faceVerts);
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
	this.generateMesh = function(bounds) {
		// this will produce an "object" that can be sent to initObjectBuffers
		var output = new Object();
		output.vertices = new Array();
		output.normals = new Array();
		output.uvs = new Array();
		output.faces = new Array();
		output.skyLight = new Array();
		output.blockLight = new Array();
		output.matColors = new Array();
		for(var z = bounds.min[2]; z < bounds.max[2]; z++) {
			for(var y = bounds.min[1]; y < bounds.max[1]; y++) {
				for(var x = bounds.min[0]; x < bounds.max[0]; x++) {
					var block = getData(x, y, z, "blocks");
					if(isCross(block)) {
						addCross(x, y, z, block, output, bounds);
					}else if(block > 0) {
						// second block layer for biome grass edges
						if(block == 2)
							addBlock(x, y, z, 0, output, bounds);
						addBlock(x, y, z, block, output, bounds);
					}
				}
			}
		}
		var baseChunk = getChunk(bounds.min[0], bounds.min[1], bounds.min[2]);
		outputBuffer = initObjectBuffers(gl, output, "chunk", baseChunk.mesh);
		outputBuffer.location = bounds.min;
		outputBuffer.rotation = [0, 0, 1, 0];
		outputBuffer.scale = [1, 1, 1];
		baseChunk.mesh = outputBuffer;
		return outputBuffer;
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
		var offset = [start[0] % 1, start[1] % 1, start[2] % 1];
		// ensure positive offsets to place start inside test cube
		for(var i in offset) {
			if(offset[i] < 0) {
				offset[i] += 1;
			}
		}
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
				var offset = [start[0] % 1, start[1] % 1, start[2] % 1];
				// ensure positive offsets to place start inside test cube
				for(var j in offset) {
					if(offset[j] < 0) {
						offset[j] += 1;
					}
				}
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

function initObjectBuffers(gl, obj, name, buffers) {
	var out;
	if(!buffers) {
		out = {
			posBuffer: gl.createBuffer(),
			normalBuffer: gl.createBuffer(),
			uvBuffer: gl.createBuffer(),
			colorBuffer: gl.createBuffer(),
			skyBuffer: gl.createBuffer(),
			blockBuffer: gl.createBuffer(),
			indexBuffer: gl.createBuffer(),
			location: obj.location,
			rotation: obj.rotation,
			scale: obj.scale, 
			name: name
		};
	}else{
		out = buffers;
	}

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

function drawScene(gl, shaderProgram, terrainTexture, skinTexture, itemTexture, model, camPos, camRot, sky) {
	gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	var pMatrix = mat4.create();
	mat4.perspective(70, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);
	gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
	
	var mvMatrixStack = [];
	var mvMatrix = mat4.create();
	mat4.identity(mvMatrix);

	mat4.rotate(mvMatrix, degToRad(camRot[0]), [1, 0, 0]);
	mat4.rotate(mvMatrix, degToRad(camRot[1]), [0, 1, 0]);
	mat4.rotate(mvMatrix, degToRad(camRot[2]), [0, 0, 1]);
	mat4.translate(mvMatrix, vec3.subtract(vec3.create(), camPos));

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, terrainTexture);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, itemTexture);
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, skinTexture);
	

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
			gl.uniform1i(shaderProgram.samplerUniform, 0);
			gl.lineWidth(2);
		}else if(model[i].name == "item") {
			gl.uniform1i(shaderProgram.samplerUniform, 1);
		}else{
			gl.disable(gl.CULL_FACE);
			gl.uniform1i(shaderProgram.samplerUniform, 2);
		}

		mvPushMatrix(mvMatrixStack, mvMatrix);

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

function skinViewer(filename) {
	var canvas = document.createElement("canvas");
	canvas.width = 1024;
	canvas.height = 768;
	var gl = initGL(canvas);
	if(!gl)
		return null;
	var shaderProgram = initShaders(gl);
	var skinTexture = initTexture(gl, filename);
	var terrainTexture = initTexture(gl, "terrain.png");
	var itemTexture = initTexture(gl, "items.png");

	var model = new Array();

	var selector = {
		vertices: [0, 0, 0,  1, 0, 0,  0, 1, 0,  1, 1, 0,  0, 0, 1,  1, 0, 1,  0, 1, 1,  1, 1, 1],
		matColors: [0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0],
		normals: [0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0],
		uvs: [0, 0,  0, 0,  0, 0,  0, 0, 0, 0,  0, 0,  0, 0,  0, 0],
		faces: [0, 1,  0, 2,  0, 4,  1, 3,  1, 5,  2, 3,  2, 6,  3, 7,  4, 5,  4, 6,  5, 7,  6, 7],
		skyLight: [0, 0, 0, 0, 0, 0, 0, 0],
		blockLight: [0, 0, 0, 0, 0, 0, 0, 0],
		location: [0, 0, 0],
		rotation: [0, 0, 1, 0],
		scale: [1.01, 1.01, 1.01]
	};
	model.push(initObjectBuffers(gl, selector, "selector"));
	selector.scale = [0.01, 0.01, 0.01];
	model.push(initObjectBuffers(gl, selector, "selector"));

	var world = new World(gl);
	for(var x = 0; x < 3; x++) {
		for(var y = 0; y < 3; y++) {
			var start = [x * 16, 0, y * 16];
			var end = vec3.add([16, 128, 16], start);
			model.push(world.generateMesh({min: start, max: end}, gl));
		}
	}

	/*model.push(initObjectBuffers(gl, Mesh.Head, "head"));
	model.push(initObjectBuffers(gl, Mesh.Mask, "mask"));
	model.push(initObjectBuffers(gl, Mesh.Body, "body"));
	model.push(initObjectBuffers(gl, Mesh.ArmLeft, "arml"));
	model.push(initObjectBuffers(gl, Mesh.ArmRight, "armr"));
	model.push(initObjectBuffers(gl, Mesh.LegLeft, "legl"));
	model.push(initObjectBuffers(gl, Mesh.LegRight, "legr"));
	model.push(initObjectBuffers(gl, Mesh.Item, "item"));*/

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.enable(gl.DEPTH_TEST);

	var sky = [
		vec3.create([0.707, -0.707, 0]), // direction
		vec3.create([1, 0.5, 0]), // diffuse
		//vec3.create([0.2, 0.2, 0.5]) // ambient
		vec3.create([1, 1, 1])
	];

	//var camPos = [-20, 50, 30];
	world.entities[0] = new world.Entity([16, 100, 16]);
	var camRot = [45, 45, 0];

	var lastMousePos = [0, 0];
	function lookFunc(event) {
		var delta = [event.clientX - lastMousePos[0], event.clientY - lastMousePos[1]];
		camRot[1] += delta[0] * 0.25;
		camRot[0] += delta[1] * 0.25;
		if(camRot[0] > 90)
			camRot[0] = 90;
		if(camRot[0] < -90)
			camRot[0] = -90;
		lastMousePos = [event.clientX, event.clientY];
	}
	document.addEventListener('mousedown', function(event) {
		lastMousePos = [event.clientX, event.clientY];
		document.addEventListener('mousemove', lookFunc, false);
	}, false);
	document.addEventListener('mouseup', function(event) {
		document.removeEventListener('mousemove', lookFunc, false);
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
		case 69: // e
			if(selectedBlock) {
				world.setBlock(selectedBlock[0], 0);
			}
			break;
		case 81: // q
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
				world.setBlock(vec3.add(selectedBlock[0], faceNormals[selectedBlock[2]]), document.getElementById("blockType").value);
			}
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

	var lastTime = 0;
	var dayRot = 0;
	var selectedBlock = null;
	var gameTime = new Date().getTime();
	setInterval(function() {
		var dirs = eulerToMat(camRot);
		selectedBlock = world.traceRay(vec3.add([0, 0.65, 0], world.entities[0].pos), [-dirs[2], -dirs[6], -dirs[10]], 20);
		// change the position of the selector
		if(selectedBlock) {
			model[0].location = vec3.subtract(vec3.create(selectedBlock[0]), [0.005, 0.005, 0.005]);
			model[1].location = vec3.subtract(vec3.add(vec3.create(selectedBlock[0]), selectedBlock[1]), [0.005, 0.005, 0.005]);
		}else{
			model[0].location = [0, 0, 0];
			model[1].location = [0, 0, 0];
		}

		world.flushMeshes();
		drawScene(gl, shaderProgram, terrainTexture, skinTexture, itemTexture, model, vec3.add([0, 0.65, 0], world.entities[0].pos), camRot, sky);

		var timeNow = new Date().getTime();
		if(lastTime != 0) {
			var elapsed = timeNow - lastTime;

			dayRot += elapsed / 5000 * Math.PI;
			sky[0] = vec3.create([Math.sin(dayRot), Math.cos(dayRot), 0]);
		
			// set the player walk force
			var dirs = eulerToMat([0, camRot[1], 0]);
			var vel = vec3.add(
				vec3.scale([-dirs[2], -dirs[6], -dirs[10]], moveDir[2]), 
				vec3.scale([-dirs[0], -dirs[4], -dirs[8]], moveDir[0])
			);
			vec3.scale(vec3.normalize(vel), 31.25 / 200);
			vec3.add(vel, [0, moveDir[1] * 31.25 / 100, 0]);
			world.entities[0].walkForce = vel;
			
			// progress the simulation to the curren time
			var currentTime = new Date().getTime();
			while(gameTime < currentTime) {
				world.tick();
				gameTime += 31.25;
				if(currentTime - gameTime > 2000) {
					console.log("can't keep up");
					gameTime = currentTime;
				}
			}
		}
		lastTime = timeNow;
	}, 30);

	return canvas;
}
