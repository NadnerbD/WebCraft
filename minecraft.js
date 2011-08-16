var vShader = " \
attribute vec3 aVertexPosition; \n\
attribute vec2 aTextureCoord; \n\
attribute vec3 aVertexColor; \n\
attribute vec3 aNormal; \n\
attribute float aSkyLight; \n\
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
	vVertexColor = aVertexColor * (uSkyLightAmbientColor + max(dot(vec3(uMVMatrix * vec4(aNormal, 0.0)), uSkyLightDir), 0.0) * uSkyLightDiffuseColor) * aSkyLight; \n\
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

	/*this.playerPos = [8, 60, 8];
	var entities = new Array();
	this.tick = function () {};
	this.addEntity = function () {};*/

	function Chunk(coord) {
		this.coord = coord;
		this.mesh = null;
		this.blocks = new Array();
		this.light = new Array();
		for(var x = 0; x < CHUNK_WIDTH_X; x++) {
			this.blocks[x] = new Array();
			this.light[x] = new Array();
			for(var y = 0; y < CHUNK_WIDTH_Y; y++) {
				this.blocks[x][y] = new Array();
				this.light[x][y] = new Array();
				for(var z = 0; z < CHUNK_WIDTH_Z; z++) {
					var blockValue = Math.sin(x * Math.PI / 5) + Math.sin(z * Math.PI / 5) > (y - 20) / 5 
						&& x >= 0 && x < 16 && z >= 0 && z < 16 && y >= 0 && y < 128;
					this.blocks[x][y][z] = blockValue * 1;
					this.light[x][y][z] = !blockValue * MAX_LIGHT;
				}
			}
		}
		for(var x = 0; x < CHUNK_WIDTH_X; x++) {
			for(var z = 0; z < CHUNK_WIDTH_Z; z++) {
				var depth = 0;
				for(var y = CHUNK_WIDTH_Y - 1; y >= 0; y--) {
					if(this.blocks[x][y][z] != 0)
						depth++;
					if(depth == 1)
						this.blocks[x][y][z] = 2;
					if(depth > 1 && depth <= 4)
						this.blocks[x][y][z] = 3;
				}
			}
		}
	}

	/* temporary chunk generation code */
	//chunks[0] = new Array();
	//chunks[0][0] = new Array();
	chunks[0][0][0].mesh = null; // = new Chunk(0);
	chunks[0][0][1].mesh = null; // = new Chunk(1);
	chunks[0][0][2].mesh = null; // = new Chunk(2);
	//chunks[1] = new Array();
	//chunks[1][0] = new Array();
	chunks[1][0][0].mesh = null; // = new Chunk(3);
	chunks[1][0][1].mesh = null; // = new Chunk(4);
	chunks[1][0][2].mesh = null; // = new Chunk(5);
	//chunks[2] = new Array();
	//chunks[2][0] = new Array();
	chunks[2][0][0].mesh = null; // = new Chunk(6);
	chunks[2][0][1].mesh = null; // = new Chunk(7);
	chunks[2][0][2].mesh = null; // = new Chunk(8);
	/* end temp chunk gen code */

	function opacity(block) {
		return (block > 0) * MAX_LIGHT;
	}
	function emit(block) {
		return 0;
	}
	function solid(block) {
		return block > 0;
	}
	function physical(block) {
		return block > 0;
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
	function getData(x, y, z, channel) {
		var def = (channel == 'light') * MAX_LIGHT;
		var chunk = getChunk(x, y, z);
		if(!chunk)
			return def;
		return chunk[channel][x % CHUNK_WIDTH_X][y % CHUNK_WIDTH_Y][z % CHUNK_WIDTH_Z];
	}
	function setData(x, y, z, channel, data) {
		var chunk = getChunk(x, y, z);
		if(chunk) {
			chunk[channel][x % CHUNK_WIDTH_X][y % CHUNK_WIDTH_Y][z % CHUNK_WIDTH_Z] = data;
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
		[0, 38, 38, 38, 38, 2],
		[1, 1, 1, 1, 1, 1],
		[0, 3, 3, 3, 3, 2],
		[2, 2, 2, 2, 2, 2],
		[16, 16, 16, 16, 16, 16],
		[4, 4, 4, 4, 4, 4]
	];
	function faceId(block, face) {
		return blockFaces[block][face];
	}
	function faceColor(block, face) {
		if((block == 2 && face == 0) || (block == 0 && face != 5))
			return [0.5, 1, 0];
		else
			return [1, 1, 1];
	}
	function isModel(block) {
		return false;
	}
	function addLight(pos, value, channel) {
		setData(pos[0], pos[1], pos[2], channel, value);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjOpac = opacity(getData(adjPos[0], adjPos[1], adjPos[2], "blocks"));
			var adjValue = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			var nextValue = value - adjOpac - 1;
			if(adjOpac == 0 && i == 5 && value == MAX_LIGHT && channel == "light")
				nextValue = value;
			if(nextValue > adjValue)
				addLight(adjPos, nextValue, channel);
		}
	}
	function removeLight(pos, channel, notFirst) {
		var locLight = getData(pos[0], pos[1], pos[2], channel);
		setData(pos[0], pos[1], pos[2], channel, 0);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjLight = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			if(adjLight > 0 && adjLight < locLight)
				removeLight(adjPos, channel, 1);
			else if(adjLight == MAX_LIGHT && i == 5 && channel == "light") // remove downward skyLight
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
		setData(pos[0], pos[1], pos[2], channel, -1);
		for(var i in faceNormals) {
			var adjPos = vec3.add(vec3.create(pos), faceNormals[i]);
			var adjLight = getData(adjPos[0], adjPos[1], adjPos[2], channel);
			var adjBlock = getData(adjPos[0], adjPos[1], adjPos[2], "blocks");
			if(adjLight == 0 && opacity(adjBlock) < MAX_LIGHT) {
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
		setData(pos[0], pos[1], pos[2], "blocks", block);
		if(opacity(block) > 0)
			removeLight(pos, "light");
		if(opacity(block) < MAX_LIGHT)
			touchLight(pos, "light");
		if(emit(block) > 0)
			addLight(pos, emit(block), "light");
	}
	// this will produce an "object" that can be sent to initObjectBuffers
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
	// the same for all faces
	var faceUVs = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
	var faceVertIndices = [0, 1, 2, 0, 2, 3];
	function addBlock(x, y, z, block, output, bounds) {
		for(var dir in faceNormals) {
			var norm = faceNormals[dir];
			if(solid(getData(x + norm[0], y + norm[1], z + norm[2], "blocks")))
				continue;
			// add vertex light attributes
			for(var index in faceVerts[dir]) {
				var value = 0;
				for(var ldir in faceVerts[dir]) {
					value += Math.pow(0.8, MAX_LIGHT - getData(
						x + norm[0] + faceVerts[dir][index][0] - faceVerts[dir][ldir][0], 
						y + norm[1] + faceVerts[dir][index][1] - faceVerts[dir][ldir][1], 
						z + norm[2] + faceVerts[dir][index][2] - faceVerts[dir][ldir][2], 
						"light"));
				}
				value /= 4;
				//var value = Math.pow(0.8, MAX_LIGHT - getData(x + norm[0], y + norm[1], z + norm[2], "light"));
				output.skyLight.push(value);
			}
			// add the normals
			for(var index in faceVerts[dir]) {
				output.normals.push(norm[0], norm[1], norm[2]);
			}
			// add the biome color layer
			for(var index in faceVerts[dir]) {
				var color = faceColor(block, dir);
				output.matColors.push(color[0], color[1], color[2]);
			}
			// add face indices shifted to current verts
			for(var index in faceVertIndices)
				output.faces.push(faceVertIndices[index] + output.vertices.length / 3);
			// add vertices, shifted to current position
			for(var index in faceVerts[dir]) {
				var vert = faceVerts[dir][index];
				output.vertices.push(
					vert[0] + x - bounds.min[0], 
					vert[1] + y - bounds.min[1], 
					vert[2] + z - bounds.min[2]
				);
			}
			// add uvs, shifted based on block type and face number
			for(var index in faceUVs) {
				var uv = faceUVs[index];
				var id = faceId(block, dir);
				var ofs = [(id % 16) / 16, Math.floor(id / 16) / 16];
				output.uvs.push(uv[0] / 16 + ofs[0], 1 - (uv[1] / 16 + ofs[1]));
			}
		}
	}
	this.generateMesh = function(bounds) {
		var output = new Object();
		output.vertices = new Array();
		output.normals = new Array();
		output.uvs = new Array();
		output.faces = new Array();
		output.skyLight = new Array();
		output.matColors = new Array();
		for(var z = bounds.min[2]; z < bounds.max[2]; z++) {
			for(var y = bounds.min[1]; y < bounds.max[1]; y++) {
				for(var x = bounds.min[0]; x < bounds.max[0]; x++) {
					var block = getData(x, y, z, "blocks");
					if(!solid(block)) {
						if(isModel(block)) {
							// this is not a standard block, we will add it's mesh
						}else{
							continue;
						}
					}
					// second block layer for biome grass edges
					if(block == 2)
						addBlock(x, y, z, 0, output, bounds);
					addBlock(x, y, z, block, output, bounds);
				}
			}
		}
		// when a block is changed, the appropriate mesh should be flagged for regeneration
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
		while(!physical(getData(block[0], block[1], block[2], "blocks")) && totalLen < length) {
			result = stepToNextBlock(block, offset, dir);
			totalLen += result.len;
		}
		if(physical(getData(block[0], block[1], block[2], "blocks")) && totalLen < length)
			return [block, offset, result.face];
		else
			return null;
	}
	this.sweepBox = function (box, pos, vel) {
		// box is simply a vector indicating the size of the box
		var minLen;
		var hitNorm;
		var length = vec3.length(vel);
		do {
			minLen = length;
			hitNorm = undefined;
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
				var dir = vec3.normalize(vec3.create(vel));
				var totalLen = 0;
				while(totalLen < length) {
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
					totalLen += stepToNextBlock(block, offset, dir).len;
				}
			}
			if(hitNorm) {
				var velToHit = vec3.scale(vec3.create(dir), minLen);
				// apply movement before collision
				vec3.subtract(vel, velToHit);
				vec3.add(pos, velToHit);
				// hack offset to prevent point-on-plane in next iteration
				vec3.add(pos, vec3.scale(vec3.create(hitNorm), -0.005));
				// adjust velocity
				vec3.add(vel, vec3.scale(vec3.create(hitNorm), -vec3.dot(vel, hitNorm)));
			}
		} while(hitNorm);
		vec3.add(pos, vel);
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
	mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);
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
	canvas.width = 800;
	canvas.height = 600;
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

	model.push(initObjectBuffers(gl, Mesh.Head, "head"));
	model.push(initObjectBuffers(gl, Mesh.Mask, "mask"));
	model.push(initObjectBuffers(gl, Mesh.Body, "body"));
	model.push(initObjectBuffers(gl, Mesh.ArmLeft, "arml"));
	model.push(initObjectBuffers(gl, Mesh.ArmRight, "armr"));
	model.push(initObjectBuffers(gl, Mesh.LegLeft, "legl"));
	model.push(initObjectBuffers(gl, Mesh.LegRight, "legr"));
	model.push(initObjectBuffers(gl, Mesh.Item, "item"));

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.enable(gl.DEPTH_TEST);

	var sky = [
		vec3.create([0.707, -0.707, 0]), // direction
		vec3.create([1, 0.5, 0]), // diffuse
		//vec3.create([0.2, 0.2, 0.5]) // ambient
		vec3.create([1, 1, 1])
	];

	var camPos = [-20, 50, 30];
	var camRot = [45, 45, 0];

	var lastMousePos = [0, 0];
	function lookFunc(event) {
		var delta = [event.clientX - lastMousePos[0], event.clientY - lastMousePos[1]];
		camRot[1] += delta[0] / 2;
		camRot[0] += delta[1] / 2;
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
		}
	}, false);

	var lastTime = 0;
	var dayRot = 0;
	var selectedBlock = null;
	setInterval(function() {
		var dirs = eulerToMat(camRot);
		selectedBlock = world.traceRay([camPos[0], camPos[1] + 0.65, camPos[2]], [-dirs[2], -dirs[6], -dirs[10]], 20);
		// change the position of the selector
		if(selectedBlock) {
			model[0].location = vec3.subtract(vec3.create(selectedBlock[0]), [0.005, 0.005, 0.005]);
			model[1].location = vec3.subtract(vec3.add(vec3.create(selectedBlock[0]), selectedBlock[1]), [0.005, 0.005, 0.005]);
		}else{
			model[0].location = [0, 0, 0];
			model[1].location = [0, 0, 0];
		}

		world.flushMeshes();
		drawScene(gl, shaderProgram, terrainTexture, skinTexture, itemTexture, model, vec3.add([0, 0.65, 0], camPos), camRot, sky);

		var timeNow = new Date().getTime();
		if(lastTime != 0) {
			var elapsed = timeNow - lastTime;

			dayRot += elapsed / 5000 * Math.PI;
			sky[0] = vec3.create([Math.sin(dayRot), Math.cos(dayRot), 0]);
		
			var colBox = [0.6, 1.7, 0.6];
			var vel = vec3.add(
				vec3.scale([-dirs[2], -dirs[6], -dirs[10]], moveDir[2] * elapsed / 100.0), 
				vec3.scale([-dirs[0], -dirs[4], -dirs[8]], moveDir[0] * elapsed / 100.0)
			);
			world.sweepBox(colBox, camPos, vel);
		}
		lastTime = timeNow;
	}, 30);

	return canvas;
}
