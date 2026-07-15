'use strict';

/* ============================================================
   초경량 QR 코드 생성기 (바이트 모드, 버전 1~40)
   - 외부 라이브러리·네트워크 없이 완전 오프라인 동작 (PWA 캐시 가능)
   - window.QRCode.svg(text, opts) → SVG 문자열 반환
   - 알고리즘 출처: Project Nayuki 'QR Code generator' (MIT) 를 이식·경량화
   ============================================================ */
(function(){

  /* ---------- GF(256) / 리드-솔로몬 ---------- */
  function mul(x, y){
    let z = 0;
    for(let i = 7; i >= 0; i--){
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree){
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for(let i = 0; i < degree; i++){
      for(let j = 0; j < result.length; j++){
        result[j] = mul(result[j], root);
        if(j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = mul(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor){
    const result = new Uint8Array(divisor.length);
    for(const b of data){
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for(let i = 0; i < result.length; i++) result[i] ^= mul(divisor[i], factor);
    }
    return result;
  }

  /* ---------- 버전/ECC 테이블 (행: L, M, Q, H · 열: version 0~40) ---------- */
  const ECC_CW = [
    [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  ];
  const NUM_BLK = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
  ];

  function numRawDataModules(ver){
    let result = (16 * ver + 128) * ver + 64;
    if(ver >= 2){
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if(ver >= 7) result -= 36;
    }
    return result;
  }
  function numDataCodewords(ver, ecl){
    return Math.floor(numRawDataModules(ver) / 8) - ECC_CW[ecl][ver] * NUM_BLK[ecl][ver];
  }

  function getBit(x, i){ return ((x >>> i) & 1) !== 0; }

  /* ---------- QR 매트릭스 ---------- */
  function QrCode(version, ecl, dataCodewords, forceMask){
    this.version = version;
    this.ecl = ecl;
    this.size = version * 4 + 17;
    const size = this.size;
    this.modules = [];
    this.isFunction = [];
    for(let y = 0; y < size; y++){
      this.modules.push(new Array(size).fill(false));
      this.isFunction.push(new Array(size).fill(false));
    }
    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    // 마스크 자동 선택 (테스트 시 forceMask 로 고정 가능)
    let mask = (forceMask == null) ? -1 : forceMask, minPenalty = Infinity;
    if(mask < 0){
      for(let m = 0; m < 8; m++){
        this.applyMask(m);
        this.drawFormatBits(m);
        const p = this.getPenaltyScore();
        if(p < minPenalty){ mask = m; minPenalty = p; }
        this.applyMask(m); // XOR 되돌리기
      }
    }
    this.applyMask(mask);
    this.drawFormatBits(mask);
    this.mask = mask;
  }

  QrCode.prototype.setFn = function(x, y, dark){
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  };

  QrCode.prototype.drawFunctionPatterns = function(){
    const size = this.size;
    for(let i = 0; i < size; i++){
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    const align = this.alignPositions();
    const n = align.length;
    for(let i = 0; i < n; i++){
      for(let j = 0; j < n; j++){
        if((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlign(align[i], align[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  };

  QrCode.prototype.drawFinder = function(x, y){
    for(let dy = -4; dy <= 4; dy++){
      for(let dx = -4; dx <= 4; dx++){
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if(xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  };

  QrCode.prototype.drawAlign = function(x, y){
    for(let dy = -2; dy <= 2; dy++)
      for(let dx = -2; dx <= 2; dx++)
        this.setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  };

  QrCode.prototype.alignPositions = function(){
    const ver = this.version;
    if(ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for(let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  QrCode.prototype.drawVersion = function(){
    if(this.version < 7) return;
    let rem = this.version;
    for(let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = this.version << 12 | rem;
    for(let i = 0; i < 18; i++){
      const color = getBit(bits, i);
      const a = this.size - 11 + i % 3, b = Math.floor(i / 3);
      this.setFn(a, b, color);
      this.setFn(b, a, color);
    }
  };

  QrCode.prototype.drawFormatBits = function(mask){
    const eclFmt = [1, 0, 3, 2][this.ecl];
    const data = eclFmt << 3 | mask;
    let rem = data;
    for(let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = (data << 10 | rem) ^ 0x5412;
    for(let i = 0; i <= 5; i++) this.setFn(8, i, getBit(bits, i));
    this.setFn(8, 7, getBit(bits, 6));
    this.setFn(8, 8, getBit(bits, 7));
    this.setFn(7, 8, getBit(bits, 8));
    for(let i = 9; i < 15; i++) this.setFn(14 - i, 8, getBit(bits, i));
    const size = this.size;
    for(let i = 0; i < 8; i++) this.setFn(size - 1 - i, 8, getBit(bits, i));
    for(let i = 8; i < 15; i++) this.setFn(8, size - 15 + i, getBit(bits, i));
    this.setFn(8, size - 8, true);
  };

  QrCode.prototype.addEccAndInterleave = function(data){
    const ver = this.version, ecl = this.ecl;
    const numBlocks = NUM_BLK[ecl][ver];
    const blockEccLen = ECC_CW[ecl][ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShort = numBlocks - rawCodewords % numBlocks;
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const blocks = [];
    const rsDiv = rsDivisor(blockEccLen);
    for(let i = 0, k = 0; i < numBlocks; i++){
      const dat = data.slice(k, k + shortLen - blockEccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, rsDiv);
      if(i < numShort) dat.push(0);
      blocks.push(dat.concat(Array.from(ecc)));
    }
    const result = [];
    for(let i = 0; i < blocks[0].length; i++){
      for(let j = 0; j < blocks.length; j++){
        if(i !== shortLen - blockEccLen || j >= numShort) result.push(blocks[j][i]);
      }
    }
    return result;
  };

  QrCode.prototype.drawCodewords = function(data){
    const size = this.size;
    let i = 0;
    for(let right = size - 1; right >= 1; right -= 2){
      if(right === 6) right = 5;
      for(let vert = 0; vert < size; vert++){
        for(let j = 0; j < 2; j++){
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if(!this.isFunction[y][x] && i < data.length * 8){
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  QrCode.prototype.applyMask = function(mask){
    const size = this.size;
    for(let y = 0; y < size; y++){
      for(let x = 0; x < size; x++){
        if(this.isFunction[y][x]) continue;
        let invert;
        switch(mask){
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = x * y % 2 + x * y % 3 === 0; break;
          case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
        }
        if(invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  /* ---------- 벌점 계산 (마스크 선택용) ---------- */
  const N1 = 3, N2 = 3, N3 = 40, N4 = 10;
  QrCode.prototype.getPenaltyScore = function(){
    const size = this.size, mod = this.modules;
    let result = 0;
    for(let y = 0; y < size; y++){
      let runColor = false, runLen = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for(let x = 0; x < size; x++){
        if(mod[y][x] === runColor){
          runLen++;
          if(runLen === 5) result += N1;
          else if(runLen > 5) result++;
        }else{
          this.finderAddHistory(runLen, hist);
          if(!runColor) result += this.finderCount(hist) * N3;
          runColor = mod[y][x]; runLen = 1;
        }
      }
      result += this.finderTerminate(runColor, runLen, hist) * N3;
    }
    for(let x = 0; x < size; x++){
      let runColor = false, runLen = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for(let y = 0; y < size; y++){
        if(mod[y][x] === runColor){
          runLen++;
          if(runLen === 5) result += N1;
          else if(runLen > 5) result++;
        }else{
          this.finderAddHistory(runLen, hist);
          if(!runColor) result += this.finderCount(hist) * N3;
          runColor = mod[y][x]; runLen = 1;
        }
      }
      result += this.finderTerminate(runColor, runLen, hist) * N3;
    }
    for(let y = 0; y < size - 1; y++){
      for(let x = 0; x < size - 1; x++){
        const c = mod[y][x];
        if(c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) result += N2;
      }
    }
    let dark = 0;
    for(const row of mod) for(const v of row) if(v) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * N4;
    return result;
  };
  QrCode.prototype.finderCount = function(h){
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  QrCode.prototype.finderTerminate = function(runColor, runLen, hist){
    if(runColor){ this.finderAddHistory(runLen, hist); runLen = 0; }
    runLen += this.size;
    this.finderAddHistory(runLen, hist);
    return this.finderCount(hist);
  };
  QrCode.prototype.finderAddHistory = function(runLen, hist){
    if(hist[0] === 0) runLen += this.size;
    hist.pop();
    hist.unshift(runLen);
  };

  /* ---------- 텍스트 → 코드워드 → QR ---------- */
  function utf8(text){
    if(typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    const out = [];
    for(let i = 0; i < text.length; i++){
      let c = text.charCodeAt(i);
      if(c < 0x80) out.push(c);
      else if(c < 0x800){ out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else if(c >= 0xD800 && c < 0xDC00){
        c = 0x10000 + ((c & 0x3FF) << 10) + (text.charCodeAt(++i) & 0x3FF);
        out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }else{ out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    }
    return out;
  }

  function encode(text, eclName, forceMask){
    const bytes = utf8(text);
    const ecl = { L: 0, M: 1, Q: 2, H: 3 }[eclName || 'M'];
    let version = -1, capacityBits = 0;
    for(let v = 1; v <= 40; v++){
      const cap = numDataCodewords(v, ecl) * 8;
      const ccBits = v <= 9 ? 8 : 16;
      if(4 + ccBits + bytes.length * 8 <= cap){ version = v; capacityBits = cap; break; }
    }
    if(version < 0) throw new Error('QR: 데이터가 너무 깁니다');

    const bb = [];
    const push = (val, len) => { for(let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
    push(4, 4);                                   // 바이트 모드
    push(bytes.length, version <= 9 ? 8 : 16);    // 길이
    for(const b of bytes) push(b, 8);
    push(0, Math.min(4, capacityBits - bb.length));    // 종료자
    push(0, (8 - bb.length % 8) % 8);                  // 바이트 정렬
    for(let pad = 0xEC; bb.length < capacityBits; pad ^= 0xEC ^ 0x11) push(pad, 8);

    const cw = new Array(bb.length / 8).fill(0);
    for(let i = 0; i < bb.length; i++) cw[i >>> 3] |= bb[i] << (7 - (i & 7));
    return new QrCode(version, ecl, cw, forceMask);
  }

  function toSvg(qr, border, dark, light){
    border = border == null ? 4 : border;
    const size = qr.size, dim = size + border * 2;
    let path = '';
    for(let y = 0; y < size; y++)
      for(let x = 0; x < size; x++)
        if(qr.modules[y][x]) path += 'M' + (x + border) + ',' + (y + border) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" '
      + 'shape-rendering="crispEdges" role="img" aria-label="공유 링크 QR 코드">'
      + '<rect width="100%" height="100%" fill="' + light + '"/>'
      + '<path d="' + path + '" fill="' + dark + '"/></svg>';
  }

  window.QRCode = {
    svg(text, opts){
      opts = opts || {};
      const qr = encode(text, opts.ecl || 'M');
      return toSvg(qr, opts.border != null ? opts.border : 4, opts.dark || '#000000', opts.light || '#ffffff');
    },
    encode: encode   // 저수준: QrCode 객체 반환(모듈 매트릭스 접근용)
  };
})();
