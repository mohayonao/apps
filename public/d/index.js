var DorilaSound = (function() {

  var panL = new Float32Array(9);
  var panR = new Float32Array(9);
  (function() {
    for (i = 0; i < 9; i++) {
      panL[i] = Math.cos(Math.PI / 2 * (i/9));
      panR[i] = Math.sin(Math.PI / 2 * (i/9));
    }
  }());
  
  var Doriland = (function() {
    var Doriland = function() {
      initialize.apply(this, arguments);
    }, $this = Doriland.prototype;
    
    var initialize = function(sys, options) {
      this.mode = 1;
      this.sys  = sys;

      options = options || {};
      if (options) {
        this._buffer = options.buffer;
      } else {
        this._buffer = new Float32Array(0);
      }

      this._phaseStepTable = (function(n) {
        var i, dx, resule = {};
        dx = Math.pow(2.0, 1.0 / 12);
        c = options.samplerate / sys.samplerate;
        for (i = -n; i <=n; i++) {
          resule[i] = c * Math.pow(dx, i);
        }
        return resule;
      }(12));
      
      (function(self, tempo, pattern) {
        var phaseTable, samplerate;
        var t;
        var begin, end;
        var i;
        samplerate = options.samplerate;
        phaseTable = [ ];
        begin = 0;
        for (i = 0; i < pattern.length; i++) {
          t = (4 * 60) / (pattern[i] * tempo);
          end = begin + (t * samplerate + 0.5)|0;
          phaseTable.push([begin, end]);
          begin = end + 1;
        }
        end = self._buffer.length - 1;
        
        begin = end + 1;
        end   = begin + ((1/6) * samplerate | 0.5)|0;
        phaseTable.push([begin, end]);
        self._phaseTable = phaseTable;
      }(this, 90, [8, 8, 16, 16, 16, 16, 8]));
      
      this._efxL = new Reverb(sys, {});
      this._efxR = new Reverb(sys, {});
      
      this.init(options);
    };
    
    var compile = function(text) {
      var ch, items, list, segno, i;
      
      segno = null;
      if (typeof text === "string") {
        text = text.trim();
        text = text.replace(/ドッドッ/g, "01");
        text = text.replace(/ドッ/g, "0");
        text = text.replace(new RegExp("ンド ".trim(), "g"),"56");
        text = text.replace(new RegExp("ド "  .trim(), "g"),"2");
        // text = text.replace(/ンド/g, "56");
        // text = text.replace(/ド/g, "2");
        text = text.replace(/リ/g, "3");
        text = text.replace(/ラ/g, "4");
        text = text.replace(/ン/g, "5");
        // text = text.replace(/ッ/g, "7");
        text = text.replace(new RegExp("ッ ".trim(), "g"), "7");
        text = text.replace(/ /g, "");
        
        list = [ ];
        items = text.split("");
        for (i = 0; i < items.length; i++) {
          ch = items[i];
          if (0 <= ch && ch <= 7) {
            list.push(ch|0);
          } else if (ch === "|") {
            segno = list.length;
          } else if (ch === "+" || ch === "-") {
            list.push(ch);
          } else if (ch === "*" || ch === "/") {
            list.push(ch);
          } else if (ch === "<" || ch === ">" || ch === "=") {
            list.push(ch);
          } else {
            list.push(ch.charCodeAt(0) % 6);
          }
        }
      } else {
        list = [0,1,2,3,4,5,6];
      }
      this._list  = list;
      this._segno = segno;
    };
    
    $this.init = function(options) {
      compile.call(this, options.text);
      
      this._index = 0;
      this._phaseStep = this._phaseStepTable[0];
      this._phaseStepIndex = 0;
      this._panIndex = 4;
      this._efxd  = 0;            
      this._efxL.setDepth(this._efxd);
      this._efxR.setDepth(this._efxd);
      
      this._listitem = this.fetch();
      this._phase = this._listitem[0];
      
      this.finished = true;
    };
    $this.play = function(callback) {
      this.finished = false;            
    };
    $this.pause = function() {
      this.finished = true;
    };
    $this.stop = function() {
      this.finished = true;
    };

    $this.fetch = function() {
      var list, index, phaseStep, phaseStepIndex, ch;
      list  = this._list;
      index = this._index;
      phaseStep = this._phaseStep;
      ch = list[index++];
      while ("+-*/<>=".indexOf(ch) !== -1) {
        switch (ch) {
        case "+":
          phaseStepIndex = this._phaseStepIndex + 1;
          if (this._phaseStepTable[phaseStepIndex] !== undefined) {
            phaseStep = this._phaseStepTable[phaseStepIndex];
            this._phaseStepIndex = phaseStepIndex;
          }
          break;
        case "-":
          phaseStepIndex = this._phaseStepIndex - 1;
          if (this._phaseStepTable[phaseStepIndex] !== undefined) {
            phaseStep = this._phaseStepTable[phaseStepIndex];
            this._phaseStepIndex = phaseStepIndex;
          }
          break;
        case "*":
          this._efxd += 0.2;
          this._efxL.setDepth(this._efxd);
          this._efxR.setDepth(this._efxd);
          break;
        case "/":
          this._efxd -= 0.2;
          this._efxL.setDepth(this._efxd);
          this._efxR.setDepth(this._efxd);
          break;
        case "<":
          if (this._panIndex > 0) this._panIndex -= 2;
          break;
        case ">":
          if (this._panIndex < 8) this._panIndex += 2;
          break;
        case "=":
          this._panIndex = 4;
          break;
        }
        ch = list[index++];
      }
      this._phaseStep = phaseStep;
      this._index = index;
      return this._phaseTable[ch];
    };
    
    $this.process = function(L, R) {
      var buffer, phase, phaseStep;
      var phaseTable, list, index, listitem, ch;
      var v;
      var i, imax;
      
      buffer = this._buffer;
      phase  = this._phase;
      phaseTable = this._phaseTable;
      list  = this._list;
      listitem = this._listitem;
      
      for (i = 0, imax = L.length; i < imax; i++) {
        v = buffer[phase|0] || 0;;
        L[i] += v * panL[this._panIndex];
        R[i] += v * panR[this._panIndex];
        phase += this._phaseStep;
        if (listitem && phase >= listitem[1]) {
          listitem = this.fetch();
          if (listitem) {
            phase = listitem[0];
          } 
        }
        if (this._index > list.length) {
          if (this._segno != null) {
            this._index = this._segno;
            listitem = this.fetch();
            phase = listitem[0];
          }
        }
      }
      
      if (this._index > list.length) {
        if (this._segno == null) {
          this.next = this._none_next;
          this.finished = true;
        }
      }
      
      this._phase = phase;
      this._listitem = listitem;
      
      this._efxL.process(L);
      this._efxR.process(R);
    };

    return Doriland;
  }());
  
  
  var Reverb = (function() {
    var Reverb = function() {
      initialize.apply(this, arguments);
    }, $this = Reverb.prototype;

    var initialize = function(sys, options) {
      this.sys = sys;

      this._efxs = (function(cnt, dx, ax) {
        var result = [];
        var d = dx, a = ax;
        var i;
        for (i = 0; i < cnt; i++) {
          result[i] = new Delay(sys, {d:d, a:a});
          d += dx;
          a *= ax;
        }
        return result;
      }(5, 0.375, 0.5));
      
      this._d = 0;
    };
    
    $this.setDepth = function(value) {
      if (value < 0) value = 0;
      else if (value > 1.0) value = 1.0;
      this._d = value;
    };
    
    $this.process = function(stream) {
      var buffer = new Float32Array(stream);
      var a1, a2;
      var efxs, i, imax;
      efxs = this._efxs;
      for (i = 0, imax = efxs.length; i < imax; i++) {
        efxs[i].process(buffer);
      }
      if (this._d !== 0) {
        a1 = 1.0 - this._d;
        a2 = this._d;
        for (i = 0, imax = stream.length; i < imax; i++) {
          stream[i] = stream[i]*a1 + buffer[i]*a2;
        }
      }
    };
    
    return Reverb;
  }());
  
  
  var Delay = (function() {
    var Delay = function() {
      initialize.apply(this, arguments);
    }, $this = Delay.prototype;
    
    var initialize = function(sys, options) {
      this.sys = sys;
      this._buffer = new Float32Array(sys.samplerate * 2);
      this.init(options);
    };
    
    $this.init = function(options) {
      this._head = (options.d * this.sys.samplerate)|0;
      this._tail = 0;
      this._amp  = options.a;
    };
    
    $this.process = function(stream) {
      var buffer, head, tail;
      var v0, v1, v2;
      var a1, a2;
      var i, imax;

      if (this._amp !== 0) {
        buffer = this._buffer;
        head = this._head;
        tail = this._tail;
        a1 = 1.0 - this._amp;
        a2 = this._amp;
        for (i = 0, imax = stream.length; i < imax; i++) {
          buffer[head] = stream[i];
          
          v1 = stream[i];
          v2 = buffer[tail]
          v0 = v1 * a1 + v2 * a2;
          stream[i] = v0;
          
          head += 1;
          tail += 1;
          if (head >= buffer.length) head = 0;
          if (tail >= buffer.length) tail = 0;
        }
      }
      this._head = head;
      this._tail = tail;
    };
    
    return Delay;
  }());
  
  
  var ToneGenerator = (function() {
    var ToneGenerator = function() {
      initialize.apply(this, arguments);
    }, $this = ToneGenerator.prototype;

    var WAVE_LENGTH = 1024;
    
    var Wavelets = (function() {
      var list = [];

      var func2wavelet = function(func) {
        var list, i;
        list = new Float32Array(WAVE_LENGTH);
        for (i = 0; i < WAVE_LENGTH;  i++) {
          list[i] = func(i / WAVE_LENGTH);
        }
        return list;
      };
      var array2wavelet = function(ary) {
        var list, i, j, jmax;
        list = new Float32Array(WAVE_LENGTH);
        jmax = WAVE_LENGTH / ary.length;
        for (i = 0; i < ary.length; i++) {
          for (j = 0; j < jmax; j++) {
            list[i * jmax + j] = ary[i];
          }
        }
        return list;
      };

      // 0: sine
      list[0] = func2wavelet(function(x) {
        return Math.sin(2 * Math.PI * x);
      });
      // 1: upwardsaw
      list[1] = func2wavelet(function(x) {
        return +2.0 * (x - Math.round(x));
      });
      // 2: downwardsaw
      list[2] = func2wavelet(function(x) {
        return -2.0 * (x - Math.round(x));
      });
      // 3: famicon
      list[3] = array2wavelet([
          +0.000, +0.125, +0.250, +0.375, +0.500, +0.625, +0.750, +0.875,
          +0.875, +0.750, +0.625, +0.500, +0.375, +0.250, +0.125, +0.000,
          -0.125, -0.250, -0.375, -0.500, -0.625, -0.750, -0.875, -1.000,
          -1.000, -0.875, -0.750, -0.625, -0.500, -0.375, -0.250, -0.125 ]);
      // 4: triangle
      list[4] = func2wavelet(function(x) {
        x -= 0.25;
        return 1.0 - 4.0 * Math.abs(Math.round(x) - x);
      });
      // 5: square
      list[5] = func2wavelet(function(x) {
        return (x < 0.5) ? -1.0 : +1.0;
      });
      // 6: noise
      list[6] = func2wavelet(function(x) {
        return Math.random() * 2.0 - 1.0;
      });
      // 7: bubble
      list[7] = array2wavelet([
          -0.625, -0.875, -0.125, +0.750, + 0.500, +0.125, +0.500, +0.750,
          +0.250, -0.125, +0.500, +0.875, + 0.625, +0.000, +0.250, +0.375,
          -0.125, -0.750, +0.000, +0.625, + 0.125, -0.500, -0.375, -0.125,
          -0.750, -1.000, -0.625, +0.000, - 0.375, -0.875, -0.625, -0.250 ]);
      return list;
    }());
    
    
    var initialize = function(track) {
      this.sys = track.sys;
      this._stepTable = calcStepTable.call(this);
      this._phase = 0;
      this._phaseStep = 0;
      this._velocity = 0;
      this._amp = 1.0;
      this._ampStep = 0;
      this._wavelet = Wavelets[3];
      this._tie = false;
    };
    
    $this.note = function(id, length, velocity) {
      if (! this._tie) {
        this._phase = 0;
      }
      this._phaseStep = this._stepTable[id];
      this._velocity = velocity;
      this._amp = 1.0;
      if (length === Infinity) {
        this._ampStep = 0;
        this._tie = true;
      } else {
        this._ampStep = 1 / length;
        this._tie = false;
      }
    };
    $this.wavelet = function(id) {
      this._wavelet = Wavelets[id];
    };
    $this.next = function(len) {
      var streamcell = new Float32Array(len);
      var wavelet, phase, phaseStep;
      var amp, ampStep, velocity;
      var i;

      wavelet   = this._wavelet;
      phase     = this._phase;
      phaseStep = this._phaseStep;
      amp       = this._amp;
      ampStep   = this._ampStep;
      velocity  = this._velocity;
      if (amp > 0) {
        for (i = 0; i < len; i++) {
          streamcell[i] = wavelet[(phase|0)%1024] * (amp * velocity);
          phase += phaseStep;
          amp   -= ampStep;
        }
      }
      this._phase = phase;
      this._amp   = amp;
      return streamcell;
    };
    
    var calcStepTable = function() {
      var list, freq, samplerate, i;
      samplerate = this.sys.samplerate;
      list = new Float32Array(128);
      for (i = 0; i < 128; i++) {
        freq = 440.0 * Math.pow(2, (i - 69) * 1/12);
        list[i] = freq * 1024 / samplerate;
      }
      return list;
    };
    
    return ToneGenerator;
  }());
  
  
  var MMLTrack = (function() {
    var MMLTrack = function() {
      initialize.apply(this, arguments);
    }, $this = MMLTrack.prototype;
    
    var TONES = {c:0, d:2, e:4, f:5, g:7, a:9, b:11};
    var SIGNS = {"-":-1, "+":+1};
    var DOTS  = [1.0, 1.5, 1.75];
    var EOF   = 0;
    var NOTE  = 1, TONE = 2, TEMPO = 3, PAN = 4;
    var SEGNO = 5, LOOP_BEGIN = 6, LOOP_EXIT = 7, LOOP_END = 8;
    
    var initialize = function(sys, options) {
      this.sys = sys;
      this.stream = new Float32Array(128);
      this._tonegen = new ToneGenerator(this);
      this._segno = null;
      this._tempo = 120;
      compile.call(this, options);
      this.init();
    };
    $this.init = function() {
      this._index = 0;
      this._counter = 0;
      this._counterMax = 0;
      this._loopitems = [];
      this._panIndex  = 4;
      this.finished = true;
    };
    $this.play = function() {
      this.finished = false;
    };
    $this.stop = function() {
      this.finished = false;
    };
    $this.process = function(L, R) {
      var stream, s;
      var al, ar;
      var i, imax, j, jmax, k;
      
      if (!this.finished) {
        s = this.next_cell();
        al = panL[this._panIndex] * 0.5;
        ar = panR[this._panIndex] * 0.5;;
        for (i = 0, imax = L.length; i < imax; i++) {
          L[i] += s[i] * al;
          R[i] += s[i] * ar;
        }
      }
    };
    $this.next_cell = function(len) {
      var stream, s;
      var counter, counterMax;
      var tonegen, quantize;
      var i;
      
      stream = this.stream;
      counter    = this._counter;
      counterMax = this._counterMax;
      
      tonegen = this._tonegen;
      
      if (counter <= 0) {
        item = this.nextCommand();
        if (item !== EOF) {
          counterMax = (60/this._tempo) * (4 / item.L);
          counterMax *= DOTS[item.dots];
          counterMax *= this.sys.samplerate;
          if (item.noteIndex !== -1) {
            quantize = counterMax * (item.Q/8);
            tonegen.note(item.noteIndex, quantize, item.V/15);
          }
          counter += counterMax;
        } else {
          this.finished = true;
          counter = Infinity;    
        }
      }
      counter -= 128;
      
      s = tonegen.next(128);
      for (i = 128; i--; ) {
        stream[i] = s[i];
      }

      this._counter    = counter;
      this._counterMax = counterMax;
      return stream;
    };
    
    $this.nextCommand = function() {
      var list, index, item, loopitem;
      list  = this._list;
      index = this._index;
      while (true) {
        item = list[index++];
        switch (item.cmd) {
        case EOF:
          if (this._segno === null) {
            return EOF;
          } else {
            index = this._segno;
          }
          break;
        case NOTE:
          this._index = index;
          return item;
          break;
        case PAN: // pan
          this._panIndex = item.value;
          break;
        case TONE: // @
          this._tonegen.wavelet(item.value);
          break;
        case TEMPO: // tempo
          this._tempo = item.value;
          break;
        case SEGNO:
          this._segno = index;
          break;
        case LOOP_BEGIN:
          this._loopitems.push({begin:index, end:0, i:0, imax:item.value});
          break;
        case LOOP_EXIT:
          loopitem = this._loopitems[this._loopitems.length-1];
          if (loopitem) {
            if (loopitem.i === loopitem.imax-1) {
              index = loopitem.end;
            }
          }
          break;
        case LOOP_END:
          loopitem = this._loopitems[this._loopitems.length-1];
          if (loopitem) {
            if (loopitem.imax === 0) {
              loopitem.imax = item.value || 2;
            }
            if (loopitem.end === 0) {
              loopitem.end = index;
            }
            loopitem.i += 1;
            if (loopitem.i < loopitem.imax) {
              index = loopitem.begin;
            } else {
              this._loopitems.pop();
            }
          }
          break;
        };
      }
    };
    
    var compile = function(options) {
      var r = /([tcdefgabrolvqp@<>()$[|\]])([-+]?)(\d*)(\.*)(&)?/gm;
      var data;
      var status = {O:5, L:8, V:12, Q:12};
      var t, n, cmd, sign, val;
      var noteIndex, length, dots, quantize;
      var list = [];
      data = options.mml;
      
      while ((x = r.exec(data.toLowerCase())) != null) {
        t = null; cmd = x[1]; sign = x[2]; val = x[3];;
        switch (cmd) {
        case "o":
          n = (val !== "") ? Number(val) : 3
          if (1 <= n && n <= 8) status.O = n;
          break;
        case "l":
          n = (val !== "") ? Number(val) : 8;
          if (1 <= n && n <= 64) status.L = n;
          break;
        case "v":
          n = (val !== "") ? Number(val) : 12;
          if (0 <= n && n <= 16) status.V = n;
          break;
        case "q":
          n = (val !== "") ? Number(val) : 12;
          if (1 <= n && n <= 16) status.Q = n;
          break;
        case "p":
          n = (val !== "") ? Number(val) : 4;
          if (0 <= n && n <= 8) {
            list.push({cmd:PAN, value:n});
          }
          break;
        case "<":
          if (status.O < 8) status.O += 1;
          break;
        case ">":
          if (status.O > 1) status.O -= 1;
          break;
        case "(":
          if (status.V < 16) status.V += 1;
          break;
        case ")":
          if (status.V > 0) status.V -= 1;
          break;
        case "r":
          t = -1;
          break;
        case "@":
          n = Number(val) || 0;
          if (0 <= n && n <= 7) {
            list.push({cmd:TONE, value:n});
          }
          break;
        case "t":
          n = Number(val) || 120;
          if (30 <= n && n <= 240) {
            list.push({cmd:TEMPO, value:n});
          }
          break;
        case "$":
          list.push({cmd:SEGNO});
          break;
        case "[":
          n = (Number(val)|0);
          list.push({cmd:LOOP_BEGIN, value:n});
          break;
        case "|":
          list.push({cmd:LOOP_EXIT});
          break;
        case "]":
          n = (Number(val)|0);
          list.push({cmd:LOOP_END, value:n});
          break;
        default:
          t = TONES[cmd];
          break;
        }
        if (t === null) {
          continue;
        } else if (t === -1) {
          noteIndex = -1;
        } else {
          noteIndex = status.O * 12 + t + (SIGNS[sign]||0);
        }
        length = (val === "") ? status.L : Number(val);
        dots   = x[4].length;
        quantize = x[5] ? Infinity : status.Q;
        list.push({cmd:NOTE, noteIndex:noteIndex, 
                   L:length, V:status.V, Q:quantize, dots:dots});
      }
      list.push({cmd:EOF});
      this._list = list;
    };
    
    return MMLTrack;
  }());
  
  
  
  var SoundSystem = (function() {
    var SoundSystem = function() {
      initialize.apply(this, arguments);
    }, $this = SoundSystem.prototype;
    
    var initialize = function(sys, options) {
      this.sys = sys;
      options = options || {};
      this._dorilandBuffer     = options.buffer;
      this._dorilandSamplerate = options.samplerate;
    };
    $this.init = function(options) {
      options = options || {};
      compile.call(this, options);

      this.finished = true;
    };
    $this.play = function() {
      this._list.forEach(function(x) { x.play(); });
      this.finished = false;
    };
    $this.stop = function() {
      this._list.forEach(function(x) { x.stop(); });
      this.finished = true;
    };
    $this.process = function(L, R) {
      var srream;
      var list, gen, s, v;
      var i, imax, j, jmax;

      for (i = 0, imax = L.length; i < imax; i++) {
        L[i] = R[i] = 0;
      }
      
      if (!this.finished) {
        list = this._list;
        
        for (i = 0, imax = list.length; i < imax; i++) {
          gen = list[i].process(L, R);
        }
        
        list = list.filter(function(x) {
          return !x.finished;
        });
        if (list.length === 0) {
          this.finished = true;
        }
        this._list = list;
      }
    };
    
    var compile = function(options) {
      var self = this;
      var text, tokens, t, o;
      var list, mml;
      var i, imax;
      text = options.text;
      list = [];
      if (typeof(text) === "string") {
        tokens = text.match(/[:;]?[^:;]+/g);
        for (i = 0; i < tokens.length; i++) {
          t = tokens[i].trim();
          if (t[0] === ";") {
            mml = t.substr(1).trim();
            if (mml.length > 0) {
              list.push(new MMLTrack(this.sys, {mml:mml}));
            }
          } else {
            if (t[0] === ":") t = t.substr(1);
            o = {buffer:this._dorilandBuffer,
                 samplerate:this._dorilandSamplerate,
                 text:t};
            list.push(new Doriland(this.sys, o));
          }
        }
      }
      this._list = list;
    };
    
    return SoundSystem;
  }());
  
  return SoundSystem;
}());



if (typeof(window) !== "undefined") {
  // Main
  $(function() {
    function load(url, callback) {
      $.get(url, function(res) {
        var binary, b0, b1, bb, x;
        var buffer;
        var i, imax;
        binary = atob(res);
        buffer = new Float32Array(binary.length/2);
        for (i = 0, imax = buffer.length; i < imax; i++) {
          b0 = binary.charCodeAt(i * 2);
          b1 = binary.charCodeAt(i * 2 + 1);
          bb = (b1 << 8) + b0;
          x = (bb & 0x8000) ? -((bb^0xFFFF)+1) : bb;
          buffer[i] = (x / 65535) * 4.0;
        }
        callback({buffer:buffer, samplerate:22050, channels:1});
      });
    }

    var isPlaying = false;
    load("/d/doriland.wav.txt", function(result) {
      var soundsystem = new DorilaSound(pico, result);
      if (result != null) {
        $("#play").on("click", function() {
          isPlaying = !isPlaying;
          var text;
          if (isPlaying) {
            text = $("#text").val().trim();
            soundsystem.init({text:text});
            soundsystem.play();
            pico.play(soundsystem);
            $(this).addClass("btn-active");
          } else {
            pico.pause();
            $(this).removeClass("btn-active");
          }
        }).text("Play");
      }
      w.postMessage(result);
    });
    
    $("#song-list li a").each(function() {
      var text = $(this).text();
      $(this).on("click", function() {
        $("#text").val(text);
        if (pico.isPlaying) {
          pico.pause();
        }
        $("#play").click();
      });
    });
    

    $("#random").on("click", function() {
      var val = random();
    });

    var $list = $("#list");
    var random = function() {
      $list.empty();
      var l = [];
      for (var i = 0; i < 10; i++) {
        var val = generate();
        var url = "http://"+location.host+"/d/#"+encodeURI(val);
        var $li = $("<li>").append($("<a>").attr({href:url}).text(val));
        $list.append($li);
        l.push(val);
      }
      return l[(Math.random() * l.length)|0];
    };

    var DORI = (function() {
      var str = "";
      str += "(ドッ|ドッ|ドッ|ド|ド|ドド)* ";
      str += "((ド|リ|ドリ){0,4}(ド|リ|ラン|ッ|ドリ){0,4} ){1,6} "
      str += "(ランド|ドリランド)?";
      return str;
    })();

    var generate = function() {
      var val;
      do { val = String_random(DORI).trim();
      } while (val.length < 10);
      return val;
    };

    $("#tweet").on("click", function() {
      var url  = "http://" + location.host + "/d/";
      var text = $("#text").val();
      text = text.replace(/@/g, "{{AT}}");
      if (text[text.length-1] !== ";") {
        text += ";";
      }
      apps.tweet({ text:text, url:url+"#"+encodeURI(text) });
    });
    
    window.onhashchange = function() {
      var text = decodeURI(location.hash.substr(1).trim());
      if (text !== "") {
        text = text.replace(/{{AT}}/g, "@");
        $("#text").val(text);
        if (isPlaying) {
          $("#play").click().click();
        }        
      }
    };

    random();
    if (location.hash) {
      window.onhashchange();
    }
    
    var w = null;
    if (typeof(Worker) !== "undefined") {
      (function() {
        var buffer = [], c = 0;
        w = new Worker("/d/index.js");
        w.addEventListener("message", function(e) {
          var a, wav;
          if (e.data.wavheader) {
            buffer = [e.data.wavheader];
          } else if (e.data.wavbody) {
            buffer.push(e.data.wavbody);
          } else if (e.data === "END") {
            wav = buffer.join("");
            $("#save").attr("disabled", false);
            $("#download").text("wav生成中...");
            var a = $(document.createElement("a"))
              .text("右クリックして保存")
              .attr("href", "data:audio/wav;base64," + btoa(wav));
            $("#download").empty().append(a);
          }
        }, false);
        
        $("#save").on("click", function() {
          $(this).attr("disabled", true);
          $("#download").text("処理中...");
          w.postMessage({text:$("#text").val().trim()});
        });
      }());
    } else {
      $("#save").hide();
    }
  });
  
} else {

  // worker
  (function() {
    var SAMPLERATE = 22050;

    var doriland_voice = null;
    addEventListener("message", function(e) {
      if (e.data.buffer) {
        doriland_voice = e.data;
      } else if (e.data.text) {
        postMessage({text:e.data.text});
        sendDorilaSound(e.data.text);
      }
    }, false);

    function sendDorilaSound(text) {
      var stream, wave, buffer, fd;
      var i, imax, y;
      var buffer = [];
      
      stream = getStream(text);
      wave = waveheader(SAMPLERATE, 2, stream.length/2);
      postMessage({wavheader:wave});
      
      for (i = 0, imax = stream.length; i < imax; i++) {
        y = (stream[i] * 32767.0) | 0;
        buffer.push( String.fromCharCode(y & 0xFF, (y >> 8) & 0xFF) );
        if (buffer.length === 2048) {
          postMessage({wavbody:buffer.join("")});
          buffer = [];
        }
      }
      if (buffer.length !== 0) {
        postMessage({wavbody:buffer.join("")});
        buffer = [];
      }
      postMessage("END");
      return wave;
    }

    function getStream(text) {
      var size = 16384;
      var driver = {SAMPLERATE:SAMPLERATE,
                    STREAM_FULL_SIZE:size,
                    NONE_STREAM_FULL_SIZExC:new Float32Array(size*2)};
      var sys;
      var s, result;
      var amp;
      var i, imax, j, jmax;
      
      sys = new DorilaSound(driver, doriland_voice);
      
      result = [];
      sys.init({text:text});
      sys.play();

      for (i = 0; i < 17; i++) {
        s = sys.next();
        for (j = 0; j < s.length; j++) {
          result.push(s[j]);
        }
        if (sys.finished) break;
        postMessage({progress:[i,28]});
      }
      
      if (! sys.finished) {
        amp  = 1.0;
        ampx = 1.0 / (size * 3);
        for (i = 0; i < 3; i++) {
          s = sys.next();
          for (j = 0; j < s.length; j += 2) {
            result.push(s[j]   * amp);
            result.push(s[j+1] * amp);
            amp -= ampx;
            if (amp < 0) amp = 0;
          }
          if (sys.finished) break;
          postMessage({progress:[i+25,28]});
        }
      }
      return new Float32Array(result);
    }

    function waveheader(samplerate, channel, samples) {
      var l1, l2, waveBytes;
      waveBytes = samples * channel * 2;
      l1 = waveBytes - 8;
      l2 = l1 - 36;
      return String.fromCharCode(
        0x52, 0x49, 0x46, 0x46, // 'RIFF'
        (l1 >>  0) & 0xFF,
        (l1 >>  8) & 0xFF,
        (l1 >> 16) & 0xFF,
        (l1 >> 24) & 0xFF,
        0x57, 0x41, 0x56, 0x45, // 'WAVE'
        0x66, 0x6D, 0x74, 0x20, // 'fmt '
        0x10, 0x00, 0x00, 0x00, // byte length
        0x01, 0x00,    // linear pcm
        channel, 0x00, // channel
        (samplerate >>  0) & 0xFF,
        (samplerate >>  8) & 0xFF,
        (samplerate >> 16) & 0xFF,
        (samplerate >> 24) & 0xFF,
        ((samplerate * channel * 2) >> 0) & 0xFF,
        ((samplerate * channel * 2) >> 8) & 0xFF,
        ((samplerate * channel * 2) >> 16) & 0xFF,
        ((samplerate * channel * 2) >> 24) & 0xFF,
        2 * channel, 0x00,      // block size
        0x10, 0x00,             // 16bit
        0x64, 0x61, 0x74, 0x61, // 'data'
        (l2 >>  0) & 0xFF,
        (l2 >>  8) & 0xFF,
        (l2 >> 16) & 0xFF,
        (l2 >> 24) & 0xFF);
    };
  }());
}
