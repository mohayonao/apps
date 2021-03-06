'use strict'

filename = 'index.js'
slice = [].slice

if typeof window != 'undefined'
  $ ->
    sc.use 'prototype'

    Neume = neume(new AudioContext())

    class DetectProcessor
      constructor: ->
        @worker = new Worker(filename)
        privates = worker:@worker, index:0, pool:{}

        @send = _send.bind privates
        @worker.addEventListener 'message', _onmessage.bind privates

        @canvas = document.createElement 'canvas'
        @width  = @canvas.width  = 160
        @height = @canvas.height = 120
        @context = @canvas.getContext '2d'

      process: (src)->
        @context.drawImage src, 0, 0, src.width, src.height, 0, 0, @width, @height

        imageData = @context.getImageData 0, 0, @width, @height

        @send('process', imageData).then (data)=>
          @detect = data

      _onmessage = (e)->
        switch e.data.type
          when 'console'
            console.log.apply console, e.data.data
          when 'return'
            dfd = @pool[e.data.index]
            if dfd then dfd.resolve e.data.data
            delete @pool[e.data.index]

       _send = (type)->
        index = @index++
        data = slice.call arguments, 1
        if data.length <= 1
          data = data[0]
        dfd = @pool[index] = new $.Deferred
        @worker.postMessage type:type, index:index, data:data
        dfd.promise()


    class ImageProcessor
      constructor: ->
        @detector = new DetectProcessor
        @canvas   = document.createElement 'canvas'
        @width    = @canvas.width  = 320
        @height   = @canvas.height = 240
        @context  = @canvas.getContext '2d'
        @mirror   = false

      setSize: (width, height)->
        @width  = @canvas.width  = width
        @height = @canvas.height = height

      process: (src, dst)->
        @detector.process src

        if not @mirror
          @context.translate src.width, 0
          @context.scale -1, 1
          @mirror = true
        @context.drawImage src, 0, 0, src.width, src.height, @width, 0, @width, @height
        imageData = @context.getImageData 0, 0, @width, @height

        context = dst.getContext '2d'
        context.putImageData imageData, 0, 0

        scale = @width / @detector.width

        x = (@width  / 5)|0
        y = (@height / 2)|0

        context.fillStyle   = 'rgba(255,255,255,0.25)'

        context.fillRect 0, @height-y, x, y
        context.fillRect @width-x, 0, x, @height

        if @detector.detect
          context.strokeStyle = '#006'
          context.fillStyle   = 'rgba(255,255,0,0.5)'

          left = @detector.detect.right
          if left.y * scale < @height - y
            left.y = -1
          else if left.y != -1
            x = @width - left.x * scale
            context.beginPath()
            context.arc x, left.y * scale, 5, 0, Math.PI * 2, true
            context.fill()
            context.stroke()
          right = @detector.detect.left
          if right.y != -1
            x = @width - right.x * scale
            context.beginPath()
            context.arc x, right.y * scale, 5, 0, Math.PI * 2, true
            context.fill()
            context.stroke()

          @callback? (
            left : if left.y  is -1 then -1 else left.y  * scale / @height
            right: if right.y is -1 then -1 else right.y * scale / @height
          )

    ThereminTone = ($)->
      $('sin', mul: 0.5, freq: [ $('@freq', value: 440), $('sin', freq: 4, mul: 2) ])
      .mul($('@amp', value: 0))
      .$('delay', delay: 0.15, feedback: 0.5)

    class SoundProcessor
      constructor: ->
        @scale = sc.Scale.major()
        @synth = null

      play: ->
        @synth?.stop()
        @synth = Neume.Synth(ThereminTone).start()

      pause: ->
        @synth?.stop()
        @synth = null

    video  = document.getElementById 'cam'
    canvas = document.getElementById 'canvas'
    processor = new ImageProcessor
    sound     = new SoundProcessor

    processor.callback = (opts)->
      freq = opts.right
      if freq != -1
        degree = ((1 - freq) * 20)|0
        if not @degree?
          @degree = degree
          freq = sound.scale.degreeToFreq degree, 110
          sound.synth.freq.value = freq
        else if @degree != degree
          @degree = degree
          freq = sound.scale.degreeToFreq degree, 110
          sound.synth.freq.targetAt freq, Neume.currentTime, 0.25

      amp = opts.left != -1
      if not @amp?
        if amp
          sound.synth.amp.value = 1
        else
          sound.synth.amp.vaue = 0
      else if @amp != amp
        if amp
          sound.synth.amp.targetAt 1, Neume.currentTime, 0.5
        else
          sound.synth.amp.targetAt 0, Neume.currentTime, 0.5
      @amp = amp

    onsuccess = (stream)->
      video.src = createObjectURL stream
      sound.play()
      utils.animate fps:5, ->
        processor.process video, canvas
        true

    onerror = (error)->
      console.log error

    navigator.webkitGetUserMedia {audio:false, video:true}, onsuccess, onerror

else do (worker = @)->

  console =
    log: ->
      worker.postMessage type:'console', data:slice.call arguments

  send = (index, data)->
    worker.postMessage type:'return', index:index, data:data

  rgb2hsv = (r, g, b)->
    h = s = v = 0
    cmax = Math.max r, g, b
    cmin = Math.min r, g, b
    v = cmax
    c = cmax - cmin
    s = c / cmax if cmax != 0

    if c != 0
      switch
        when r is cmax
          h = 0 + (g - b) / c
        when g is cmax
          h = 2 + (b - r) / c
        else # b is cmax
          h = 4 + (r - g) / c
      h *= 60
      h += 360 if h < 0
    h:h, s:s, v:v

  process = (imageData)->
    { width, height, data } = imageData
    left   = x:0, y:0, c:0, width: (width/5)|0
    center = x:0, y:0, c:0
    right  = x:0, y:0, c:0, width: width - left.width
    thres  = ((width * height) * 0.0025)|0
    x = y  = 0
    for i in [0...data.length] by 4
      { h, s, v } = rgb2hsv data[i+0], data[i+1], data[i+2]

      x += 1
      if x is width
        [ x, y ] = [ 0, y + 1 ]

      if 0 <= h <= 30 and 0.15 <= s and 0.15 <= v
        obj = switch
          when x <= left .width then left
          when x >= right.width then right
          else center
        obj.x += x
        obj.y += y
        obj.c += 1

    if left.c >= thres
      left.x /= left.c
      left.y /= left.c
    else
      left.x = -1
      left.y = -1
    if center.c >= thres
      center.x /= center.c
      center.y /= center.c
    else
      center.x = -1
      center.y = -1
    if right.c >= thres
      right.x /= right.c
      right.y /= right.c
    else
      right.x = -1
      right.y = -1

    left:left, center:center, right:right

  worker.addEventListener 'message', (e)->
    {type, data, index} = e.data
    switch type
      when 'process'
        send index, process data
