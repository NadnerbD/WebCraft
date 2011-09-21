// JavaScript's built in random number generator cannot be seeded
// this makes the output of this object non-repeatable, but simplifies
// point generation because values do not have to be generated in any
// particular order

function Noise(levels, maxsize) {
	var valueCache = new Array();
	for(var i = 0; i < levels; i++)
		valueCache.push(new Array());
	
	function lerp(x, y, a) {
		return x * a + y * (1 - a);
	}

	function qerp(x, y, a) {
		return lerp(x, y, 3 * a * a - 2 * a * a * a);
	}

	function getValue1D(cache, x) {
		var cell = Math.floor(x);
		var frac = x - cell;
		if(cache[cell] == undefined)
			cache[cell] = Math.random();
		if(cache[cell + 1] == undefined)
			cache[cell + 1] = Math.random();
		return qerp(cache[cell + 1], cache[cell], frac);
	}

	function getValue2D(cache, x, y) {
		var ycell = Math.floor(y);
		var yfrac = y - ycell;
		if(cache[ycell] == undefined)
			cache[ycell] = new Array();
		if(cache[ycell + 1] == undefined)
			cache[ycell + 1] = new Array();
		var a = getValue1D(cache[ycell + 1], x);
		var b = getValue1D(cache[ycell], x);
		return qerp(a, b, yfrac);
	}

	function getValue3D(cache, x, y, z) {
		var zcell = Math.floor(z);
		var zfrac = z - zcell;
		if(cache[zcell] == undefined)
			cache[zcell] = new Array();
		if(cache[zcell + 1] == undefined)
			cache[zcell + 1] = new Array();
		var a = getValue2D(cache[zcell + 1], x, y);
		var b = getValue2D(cache[zcell], x, y);
		return qerp(a, b, zfrac);
	}

	this.sample = function (x, y, z) {
		var out = 0;
		for(var level = 0; level < levels; level++) {
			var lx = x / maxsize * Math.pow(2, level);
			var ly = y / maxsize * Math.pow(2, level);
			var lz = z / maxsize * Math.pow(2, level);
			out += getValue3D(valueCache[level], lx, ly, lz) / Math.pow(2, level);
		}
		// output should be scaled to between 0 and 1
		return out / (2 - 1 / levels);
	}
}
