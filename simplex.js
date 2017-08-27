function SimplexNoise(octaves, maxsize) {
	var perm = [151,160,137,91,90,15,
	131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
	190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
	88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,
	77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,
	102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208, 89,18,169,200,196,
	135,130,116,188,159,86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,
	5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
	223,183,170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,
	129,22,39,253, 19,98,108,110,79,113,224,232,178,185, 112,104,218,246,97,228,
	251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,249,14,239,107,
	49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,150,254,
	138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];

	//var grads = [[0, 1], [1, 0], [0.707, 0.707], [-0.707, -0.707], [-1, 0], [0, -1], [0.707, -0.707], [-0.707, 0.707]];

	var grads = [];
	var step = Math.PI / 8;
	for(var i = 0; i < Math.PI * 2; i += step) {
		grads.push([Math.cos(i), Math.sin(i)]);
	}

	var unskew = (6 - Math.sqrt(12)) / 12;
	var skew = ((1 / (1 - 2 * unskew)) - 1) / 2; 

	function noise(x, y) {
		// skew the input out
		var s = (x + y) * skew;

		// locate our simplex corner
		var i = Math.floor(x + s);
		var j = Math.floor(y + s);

		// unskew the corner
		var At = (i + j) * unskew;
		var Ax = i - At;
		var Ay = j - At;

		// get the real space offset from corner to x, y
		var ofsAx = x - Ax;
		var ofsAy = y - Ay;

		// determine the offsets to the other corners
		var io, jo;
		if(ofsAx > ofsAy) {
			io = 1; jo = 0;
		}else{
			io = 0; jo = 1;
		}

		var ofsBx = ofsAx - io + unskew;
		var ofsBy = ofsAy - jo + unskew;

		var ofsCx = ofsAx - 1 + unskew * 2;
		var ofsCy = ofsAy - 1 + unskew * 2;

		// use the double lookup hash to decide on gradient indicies
		// note that this will repeat the texture every 255 simplexes
		var ii = i & 255;
		var jj = j & 255;
		var gi0 = perm[(ii + perm[jj]) & 255] % grads.length;
		var gi1 = perm[(ii + io + perm[jj + jo]) & 255] % grads.length;
		var gi2 = perm[(ii + 1  + perm[jj + 1 ]) & 255] % grads.length;

		// 1/2 - distance squared
		var t0 = 0.5 - ofsAx*ofsAx - ofsAy*ofsAy;
		if(t0 < 0) {
			n0 = 0;
		}else{
			t0 *= t0;
			n0 = t0 * t0 * (grads[gi0][0] * ofsAx + grads[gi0][1] * ofsAy);
		}
		
		var t1 = 0.5 - ofsBx*ofsBx - ofsBy*ofsBy;
		if(t1 < 0) {
			n1 = 0;
		}else{
			t1 *= t1;
			n1 = t1 * t1 * (grads[gi1][0] * ofsBx + grads[gi1][1] * ofsBy);
		}
		
		var t2 = 0.5 - ofsCx*ofsCx - ofsCy*ofsCy;
		if(t2 < 0) {
			n2 = 0;
		}else{
			t2 *= t2;
			n2 = t2 * t2 * (grads[gi2][0] * ofsCx + grads[gi2][1] * ofsCy);
		}

		// value is in the range [-1, 1]
		var value = 70.0 * (n0 + n1 + n2);

		// we return [0, 1]
		return value / 2 + 0.5;
		
		/*var scale = 6;
		return [
			Math.max(0, 255 - (ofsAx*ofsAx + ofsAy*ofsAy) * 255 * scale),
			Math.max(0, 255 - (ofsBx*ofsBx + ofsBy*ofsBy) * 255 * scale),
			Math.max(0, 255 - (ofsCx*ofsCx + ofsCy*ofsCy) * 255 * scale)
		];*/
	}

	this.sample = function (x, y, z) {
		// sum octaves
		var value = 0;
		for(var j = 0; j < octaves; j++) {
			var d = Math.pow(2, j);
			value += noise(x / maxsize * d, y / maxsize * d) / d;
		}
		// scale result to remain within output range of noise()
		return value / (2 - 1 / Math.pow(2, octaves - 1));
	}
}