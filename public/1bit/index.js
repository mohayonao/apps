(function() {
  'use strict';
  var Envelope, MMLSequencer, MMLTrack, Pulse, WaveViewer;

  Pulse = (function() {
    function Pulse() {
      this.cell = new Float32Array(pico.cellsize);
      this.width = 0.5;
      this.phase = 0;
      this.phaseStep = 0;
    }

    Pulse.prototype.setFreq = function(val) {
      return this.phaseStep = val / pico.samplerate;
    };

    Pulse.prototype.setWidth = function(val) {
      return this.width = val * 0.01;
    };

    Pulse.prototype.process = function() {
      var cell, i, phase, phaseStep, width, _i, _ref;
      cell = this.cell;
      phaseStep = this.phaseStep;
      width = this.width;
      phase = this.phase;
      for (i = _i = 0, _ref = cell.length; _i < _ref; i = _i += 1) {
        cell[i] = (phase < width) | 0;
        phase += phaseStep;
        while (phase >= 1) {
          phase -= 1;
        }
      }
      this.phase = phase;
      return cell;
    };

    return Pulse;

  })();

  Envelope = (function() {
    function Envelope() {
      this.samples = 0;
      this.amp = true;
    }

    Envelope.prototype.setTime = function(val, amp) {
      this.amp = amp;
      return this.samples = (val * pico.samplerate * 0.001) | 0;
    };

    Envelope.prototype.process = function(cell) {
      var i, samples, _i, _j, _ref, _ref1;
      samples = this.samples;
      if (this.amp) {
        for (i = _i = 0, _ref = cell.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
          cell[i] *= (samples-- > 0) | 0;
        }
      } else {
        for (i = _j = 0, _ref1 = cell.length; 0 <= _ref1 ? _j < _ref1 : _j > _ref1; i = 0 <= _ref1 ? ++_j : --_j) {
          cell[i] = 0;
        }
      }
      this.samples = samples;
      return cell;
    };

    return Envelope;

  })();

  MMLTrack = (function() {
    var MMLCommands;

    function MMLTrack(mml) {
      this.samplerate = pico.samplerate;
      this.t = 120;
      this.l = 4;
      this.o = 5;
      this.segnoIndex = null;
      this.index = -1;
      this.samples = 0;
      this.loopStack = [];
      this.commands = this.compile(mml);
      this.pulse = new Pulse();
      this.env = new Envelope();
    }

    MMLTrack.prototype.compile = function(mml) {
      var checked, cmd, commands, def, i, m, re, _i, _j, _len, _ref;
      commands = [];
      checked = new Array(mml.length);
      for (_i = 0, _len = MMLCommands.length; _i < _len; _i++) {
        def = MMLCommands[_i];
        re = def.re;
        while (m = re.exec(mml)) {
          if (!checked[m.index]) {
            for (i = _j = 0, _ref = m[0].length; 0 <= _ref ? _j < _ref : _j > _ref; i = 0 <= _ref ? ++_j : --_j) {
              checked[m.index + i] = true;
            }
            cmd = def.func(m);
            cmd.index = m.index;
            cmd.origin = m[0];
            commands.push(cmd);
          }
        }
      }
      commands.sort(function(a, b) {
        return a.index - b.index;
      });
      return commands;
    };

    MMLTrack.prototype.doCommand = function(cmd) {
      var freq, len, peek, sec;
      if (cmd === void 0) {
        if (this.segnoIndex !== null) {
          return this.index = this.segnoIndex;
        } else {
          this.samples = Infinity;
          return this.isEnded = true;
        }
      } else {
        switch (cmd.name) {
          case '@w':
            return this.pulse.setWidth(cmd.val);
          case 't':
            return this.t = cmd.val;
          case 'l':
            return this.l = cmd.val;
          case 'o':
            return this.o = cmd.val;
          case '<':
            return this.o += 1;
          case '>':
            return this.o -= 1;
          case '$':
            return this.segnoIndex = this.index;
          case '/:':
            return this.loopStack.push({
              index: this.index,
              count: cmd.val || 2,
              exit: 0
            });
          case ':/':
            peek = this.loopStack[this.loopStack.length - 1];
            peek.exit = this.index;
            peek.count -= 1;
            if (peek.count <= 0) {
              return this.loopStack.pop();
            } else {
              return this.index = peek.index;
            }
            break;
          case '/':
            peek = this.loopStack[this.loopStack.length - 1];
            if (peek.count === 1) {
              this.loopStack.pop();
              return this.index = peek.exit;
            }
            break;
          case 'note':
          case 'rest':
            len = cmd.len || this.l;
            sec = (60 / this.t) * (4 / len);
            this.samples += (sec * pico.samplerate) | 0;
            this.samples *= [1, 1.5, 1.75][cmd.dot] || 1;
            freq = cmd.name === 'rest' ? 0 : 440 * Math.pow(Math.pow(2, 1 / 12), cmd.tone + this.o * 12 - 69);
            this.pulse.setFreq(freq);
            return this.env.setTime(sec * 800, !!freq);
        }
      }
    };

    MMLTrack.prototype.process = function() {
      var cell;
      while (this.samples <= 0) {
        this.doCommand(this.commands[++this.index]);
      }
      this.samples -= pico.cellsize;
      if (this.samples !== Infinity) {
        cell = this.pulse.process();
        return this.env.process(cell);
      }
    };

    MMLCommands = [
      {
        re: /@w(\d*)/g,
        func: function(m) {
          return {
            name: '@w',
            val: m[1] | 0
          };
        }
      }, {
        re: /t(\d*)/g,
        func: function(m) {
          return {
            name: 't',
            val: m[1] | 0
          };
        }
      }, {
        re: /l(\d*)/g,
        func: function(m) {
          return {
            name: 'l',
            val: m[1] | 0
          };
        }
      }, {
        re: /o(\d*)/g,
        func: function(m) {
          return {
            name: 'o',
            val: m[1] | 0
          };
        }
      }, {
        re: /[<>]/g,
        func: function(m) {
          return {
            name: m[0]
          };
        }
      }, {
        re: /\/:(\d*)/g,
        func: function(m) {
          return {
            name: '/:',
            val: m[1] | 0
          };
        }
      }, {
        re: /:\//g,
        func: function(m) {
          return {
            name: ':/'
          };
        }
      }, {
        re: /\//g,
        func: function(m) {
          return {
            name: '/'
          };
        }
      }, {
        re: /\$/g,
        func: function(m) {
          return {
            name: '$'
          };
        }
      }, {
        re: /([cdefgab])([-+]?)(\d*)(\.*)/g,
        func: function(m) {
          return {
            name: 'note',
            len: m[3] | 0,
            dot: m[4].length,
            tone: {
              c: 0,
              d: 2,
              e: 4,
              f: 5,
              g: 7,
              a: 9,
              b: 11
            }[m[1]] + ({
              '-': -1,
              '+': +1
            }[m[2]] | 0)
          };
        }
      }, {
        re: /r(\d*)(\.*)/g,
        func: function(m) {
          return {
            name: 'rest',
            len: m[1] | 0,
            dot: m[2].length
          };
        }
      }
    ];

    return MMLTrack;

  })();

  MMLSequencer = (function() {
    function MMLSequencer(mml) {
      this.tracks = (function() {
        var _i, _len, _ref, _results;
        _ref = mml.split(';').filter(function(x) {
          return x;
        });
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          mml = _ref[_i];
          _results.push(new MMLTrack(mml));
        }
        return _results;
      })();
      this.cell = new Float32Array(pico.cellsize);
      this.index = 0;
    }

    MMLSequencer.prototype.process = function(L, R) {
      var cell, i, index, j, step, tmp, track, _i, _j, _k, _len, _ref, _ref1, _ref2, _ref3;
      cell = this.cell;
      step = this.tracks.length;
      index = this.index;
      _ref = this.tracks;
      for (j = _i = 0, _len = _ref.length; _i < _len; j = ++_i) {
        track = _ref[j];
        tmp = track.process();
        if (tmp) {
          for (i = _j = _ref1 = (index + j) % step, _ref2 = cell.length; step > 0 ? _j < _ref2 : _j > _ref2; i = _j += step) {
            cell[i] = tmp[i];
          }
        }
      }
      this.index += step;
      for (i = _k = 0, _ref3 = cell.length; _k < _ref3; i = _k += 1) {
        L[i] = R[i] = cell[i] * 0.25;
      }
      return 0;
    };

    return MMLSequencer;

  })();

  WaveViewer = (function() {
    var animate;

    function WaveViewer() {
      this.canvas = document.getElementById('canvas');
      this.target = null;
      this.animate = null;
      this.width = this.canvas.width = $(this.canvas).width();
      this.height = this.canvas.height = $(this.canvas).height();
      this.context = this.canvas.getContext('2d');
      this.context.font = '12px monospace';
      this.context.fillStyle = '#ffffff';
      this.context.strokeStyle = '#2980b9';
    }

    WaveViewer.prototype.play = function() {
      this.animate = animate.bind(this);
      return requestAnimationFrame(this.animate);
    };

    WaveViewer.prototype.pause = function() {
      return this.animate = null;
    };

    animate = function() {
      var i, text;
      if (!this.target) {
        return;
      }
      if (!this.animate) {
        return;
      }
      this.context.fillRect(0, 0, this.width, this.height);
      text = ((function() {
        var _i, _ref, _results;
        _results = [];
        for (i = _i = 0, _ref = this.target.length; _i < _ref; i = _i += 1) {
          _results.push(this.target[i]);
        }
        return _results;
      }).call(this)).join(' ');
      this.context.strokeText(text, 0, 12, this.width);
      return requestAnimationFrame(this.animate);
    };

    return WaveViewer;

  })();

  $(function() {
    var viewer, vue;
    vue = new Vue({
      el: '#app',
      data: {
        mml: '',
        sampleRate: 44100,
        isPlaying: false
      },
      methods: {
        play: function() {
          var sequencer;
          this.isPlaying = !this.isPlaying;
          if (this.isPlaying) {
            sequencer = new MMLSequencer(this.mml);
            pico.play(sequencer);
            viewer.target = sequencer.cell;
            return viewer.play();
          } else {
            pico.pause();
            return viewer.pause();
          }
        },
        select: function(id) {
          return $.get("./" + id + ".mml").then((function(_this) {
            return function(data) {
              return _this.mml = data;
            };
          })(this));
        }
      }
    });
    if (pico.env === 'nop') {
      return;
    }
    viewer = new WaveViewer();
    return vue.mml = 't150 l16 @w40 o6 /:16 crcrcrrc rcrrcrcr > brbrbrrb rbrrbrbr < :/;\nt150 l16 @w40 o5 /:16 frfrfrdf rfrdfdfr   erererce rercecer   :/';
  });

}).call(this);
