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

	var grads = [
		[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
		[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
		[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
	];

	var unskew = 1 / 6;
	var skew = 1 / 3;

	// simplices are smaller than cubic grids
	maxsize /= skew;

	function noise(x, y, z) {
		// skew the input out
		var s = (x + y + z) * skew;

		// locate our simplex corner
		var i = Math.floor(x + s);
		var j = Math.floor(y + s);
		var k = Math.floor(z + s);

		// unskew the corner
		var At = (i + j + k) * unskew;
		var Ax = i - At;
		var Ay = j - At;
		var Az = k - At;

		// get the real space offset from corner to x, y
		var ofsAx = x - Ax;
		var ofsAy = y - Ay;
		var ofsAz = z - Az;

		// determine the offsets to the other corners
		var i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
		var i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
		if(ofsAx >= ofsAy) {
			if(ofsAy >= ofsAz)		{ i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
			else if(ofsAx >= ofsAz)	{ i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
			else					{ i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
		} else {
			 if(ofsAy < ofsAz)		{ i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
			 else if(ofsAx < ofsAz)	{ i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
			 else					{ i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
		}
		// A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
		// a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
		// a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
		// c = 1/6.
		var ofsBx = ofsAx - i1 + unskew; // Offsets for second corner
		var ofsBy = ofsAy - j1 + unskew;
		var ofsBz = ofsAz - k1 + unskew;

		var ofsCx = ofsAx - i2 + 2 * unskew; // Offsets for third corner
		var ofsCy = ofsAy - j2 + 2 * unskew;
		var ofsCz = ofsAz - k2 + 2 * unskew;

		var ofsDx = ofsAx - 1 + 3 * unskew; // Offsets for fourth corner
		var ofsDy = ofsAy - 1 + 3 * unskew;
		var ofsDz = ofsAz - 1 + 3 * unskew;

		// use the lookup hash to decide on gradient indicies
		// note that this will repeat the texture every 255 simplexes
		var ii = i & 255;
		var jj = j & 255;
		var kk = k & 255;
		var gi0 = perm[(ii +      perm[(jj +      perm[kk     ]) & 255]) & 255] % grads.length;
		var gi1 = perm[(ii + i1 + perm[(jj + j1 + perm[kk + k1]) & 255]) & 255] % grads.length;
		var gi2 = perm[(ii + i2 + perm[(jj + j2 + perm[kk + k2]) & 255]) & 255] % grads.length;
		var gi3 = perm[(ii + 1  + perm[(jj + 1  + perm[kk + 1 ]) & 255]) & 255] % grads.length;

		// 1/2 - distance squared
		var t0 = 0.5 - ofsAx*ofsAx - ofsAy*ofsAy - ofsAz*ofsAz;
		if(t0 < 0) {
			n0 = 0;
		}else{
			t0 *= t0;
			n0 = t0 * t0 * (grads[gi0][0] * ofsAx + grads[gi0][1] * ofsAy + grads[gi0][2] * ofsAz);
		}
		
		var t1 = 0.5 - ofsBx*ofsBx - ofsBy*ofsBy - ofsBz*ofsBz;
		if(t1 < 0) {
			n1 = 0;
		}else{
			t1 *= t1;
			n1 = t1 * t1 * (grads[gi1][0] * ofsBx + grads[gi1][1] * ofsBy + grads[gi1][2] * ofsBz);
		}
		
		var t2 = 0.5 - ofsCx*ofsCx - ofsCy*ofsCy - ofsCz*ofsCz;
		if(t2 < 0) {
			n2 = 0;
		}else{
			t2 *= t2;
			n2 = t2 * t2 * (grads[gi2][0] * ofsCx + grads[gi2][1] * ofsCy + grads[gi2][2] * ofsCz);
		}

		var t3 = 0.5 - ofsDx*ofsDx - ofsDy*ofsDy - ofsDz*ofsDz;
		if(t3 < 0) {
			n3 = 0;
		}else{
			t3 *= t3;
			n3 = t3 * t3 * (grads[gi3][0] * ofsDx + grads[gi3][1] * ofsDy + grads[gi3][2] * ofsDz);
		}

		// value is in the range [-1, 1]
		var value = 32.0 * (n0 + n1 + n2 + n3);

		// we return [0, 1]
		return value / 2 + 0.5;

		/*
		var scale = 6;
		return	Math.max(0, 1 - (ofsAx*ofsAx + ofsAy*ofsAy + ofsAz*ofsAz) * scale) + 
				Math.max(0, 1 - (ofsBx*ofsBx + ofsBy*ofsBy + ofsBz*ofsBz) * scale) + 
				Math.max(0, 1 - (ofsCx*ofsCx + ofsCy*ofsCy + ofsCz*ofsCz) * scale) + 
				Math.max(0, 1 - (ofsDx*ofsDx + ofsDy*ofsDy + ofsDz*ofsDz) * scale);
		*/
	}

	this.sample = function (x, y, z) {
		// sum octaves
		var value = 0;
		for(var j = 0; j < octaves; j++) {
			var d = Math.pow(2, j);
			value += noise(x / maxsize * d, y / maxsize * d, z / maxsize * d) / d;
		}
		// scale result to remain within output range of noise()
		return value / (2 - 1 / Math.pow(2, octaves - 1));
	}
}