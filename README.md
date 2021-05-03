# gcode-viewer

[on npmjs.com](https://www.npmjs.com/package/gcode-viewer)

This is a basic GCode viewer lib for js / ts.  
It is specifically built for [GoSlice](https://github.com/aligator/GoSlice) but may also work with GCode from other slicers.

## Features

* slicing the viewed lines either by layer or line by line
* line thickness basesed on the extrusion amount
* colorize the lines based on line-metadata such as temperature or speed
* changeable amount of radial segments per line - less (e.g. 3) is faster and needs less RAM, more (e.g. 8 -> the default) may look better.
* uses orbit controls from three js
* relative movement for xyz and extrusion (not tested yet)

## Contribution
You are welcome to help.  
[Just look for open issues](https://github.com/aligator/gcode-viewer/issues) and pick one, create new issues or create new pull requests.

## Usage
[Take a look at this example.](https://github.com/aligator/dev/blob/main/src/windows/gcodeViewer.tsx)

### Setup

```js
const renderer = new GCodeRenderer(gcodeString, 800, 600, new Color(0x808080))

// This is an example using the Speed colorizer.
// Other options are:
// * SimpleColorizer (default) - sets all lines to the same color
// * SpeedColorizer - colorizes based on the speed / feed rate
// * TempColorizer - colorizes based on the temperature
renderer.colorizer = new SpeedColorizer(this.renderer.getMinMaxValues().minSpeed || 0, this.renderer.getMinMaxValues().maxSpeed)

document.getElementById("gcode-viewer").append(renderer.element())

this.renderer.render().then(() => console.log("rendering finished"))
```

### Resize
Just call `renderer.resize(width, height)` whenever the size changes.

### Slice the rendered model
To only show specific parts of the model you can use this:
* `renderer.sliceLayer(minLayer, maxLayer)` to slice based on the layer
* `renderer.slice(minPointNr, maxPointNr)` to slice based on the amount of points

For both see the documentation in the code/comments.

### Line resolution
To save some Memory and speedup the rendering a bit, you can reduce
the amount of planes per segment used:

```js
renderer.radialSegments = 3
```
The default is `8`.

### Travel lines
You can change the line width of travel lines:
```js
renderer. travelWidth = 0.1
```
The default is `0.01`. `0` is also possible to completely hide them.