import {
    Vector3,
    LineCurve3,
} from 'three'
import { LineTubeGeometry } from "./LineTubeGeometry";
import { LinePoint } from "./LinePoint";
import { SegmentColorizer, SimpleColorizer } from './SegmentColorizer';

/**
 * GCode renderer which parses a GCode file and displays it using 
 * three.js. Use .element() to retrieve the DOM canvas element.
 */
export class GCodeParser {
    private combinedLines: LineTubeGeometry[] = []

    private gCode: string

    public min?: Vector3
    public max?: Vector3

    private minTemp: number | undefined = undefined
    private maxTemp = 0
    private minSpeed: number | undefined = undefined
    private maxSpeed = 0

    private layerIndex: {start: number, end: number}[] = []

    // Public configurations: 
    
    /**
     * Width of travel-lines. Use 0 to hide them. 
     * 
     * @type number
     */
    public travelWidth: number = 0.01

    /**
     * Set any colorizer implementation to change the segment color based on the segment
     * metadata. Some default implementations are provided.
     * 
     * @type SegmentColorizer
     */
    public colorizer: SegmentColorizer = new SimpleColorizer()

    /**
     * The number of radial segments per line.
     * Less (e.g. 3) provides faster rendering with less memory usage.  
     * More (e.g. 8) provides a better look.
     * 
     * @default 8
     * @type number
     */
    public radialSegments: number = 8

    /**
     * Internally the rendered object is split into several. This allows to reduce the
     * memory consumption while rendering.
     * You can set the number of points per object.
     * In most cases you can leave this at the default.
     * 
     * @default 120000
     * @type number
     */
    public pointsPerObject: number = 120000

    /**
     * Creates a new GCode renderer for the given gcode.
     * It initializes the canvas to the given size and 
     * uses the passed color as background.
     * 
     * @param {string} gCode 
     * @param {number} width 
     * @param {number} height 
     * @param {Color} background 
     */
    constructor(gCode: string) {
        this.gCode = gCode

        // Pre-calculate some min max values, needed for colorizing.
        this.calcMinMaxMetadata()
    }

    /**
     * This can be used to retrieve some min / max values which may
     * be needed as param for a colorizer.
     * @returns {{
     *         minTemp: number | undefined, 
     *         maxTemp: number, 
     *         minSpeed: number | undefined, 
     *         maxSpeed: number
     *     }}
     */
    public getMinMaxValues() {
        return {
            minTemp: this.minTemp,
            maxTemp: this.maxTemp,
            minSpeed: this.minSpeed,
            maxSpeed: this.maxSpeed
        }
    }

    /**
     * Recalculate the bounding box with the new point.
     * @param {Vector3} newPoint 
     */
    private calcMinMax(newPoint: Vector3) {
        if (this.min === undefined) {
            this.min = newPoint.clone()
        }
        if (this.max === undefined) {
            this.max = newPoint.clone()
        }

        if (newPoint.x >  this.max.x) {
            this.max.x = newPoint.x
        }
        if (newPoint.y > this.max.y) {
            this.max.y = newPoint.y
        }
        if (newPoint.z > this.max.z) {
            this.max.z = newPoint.z
        }

        if (newPoint.x <  this.min.x) {
            this.min.x = newPoint.x
        }
        if (newPoint.y <  this.min.y) {
            this.min.y = newPoint.y
        }
        if (newPoint.z <  this.min.z) {
            this.min.z = newPoint.z
        }
    }

    private parseValue(value?: string): number | undefined {
        if (!value) {
            return undefined
        }
        return Number.parseFloat(value.substring(1))
    }

    /**
     * Pre-calculates the min max metadata which may be needed for the colorizers.
     */
    private calcMinMaxMetadata() {
        this.gCode.split("\n").forEach((line, i)=> {
            if (line === undefined || line[0] === ";") {
                return
            }

            const cmd = line.split(" ")
            if (cmd[0] === "G0" || cmd[0] === "G1") {
                // Feed rate -> speed
                const f = this.parseValue(cmd.find((v) => v[0] === "F"))

                if (f === undefined) {
                    return
                }

                if (f > this.maxSpeed) {
                    this.maxSpeed = f
                }
                if (this.minSpeed === undefined || f < this.minSpeed) {
                    this.minSpeed = f
                }
            } else if (cmd[0] === "M104" || cmd[0] === "M109") {
                // hot end temperature
                // M104 S205 ; set hot end temp
                // M109 S205 ; wait for hot end temp
                const hotendTemp = this.parseValue(cmd.find((v) => v[0] === "S")) || 0

                if (hotendTemp > this.maxTemp) {
                    this.maxTemp = hotendTemp
                }
                if (this.minTemp === undefined || hotendTemp < this.minTemp) {
                    this.minTemp = hotendTemp
                }
            }
        })
    }

    /**
     * Reads the GCode and crates a mesh of it.
     */
    public async parse() {
        // Cache the start and end of each layer.
        // Note: This may not work properly in some cases where the nozzle moves back down mid-print.
        const layerPointsCache: Map<number, {start: number, end: number}> = new Map()

        // Remember which values are in relative-mode.
        const relative: {
            x: boolean,
            y: boolean,
            z: boolean,
            e: boolean
        } = {
            x: false, y: false, z: false, e: false
        }

        // Save some values
        let lastLastPoint: Vector3 = new Vector3(0, 0, 0)
        let lastPoint: Vector3 = new Vector3(0, 0, 0)
        let lastE = 0
        let lastF = 0
        let hotendTemp = 0

        // Retrieves a value taking into account possible relative values.
        const getValue = (cmd: string[], name: string, last: number, relative: boolean): number => {
            let val = this.parseValue(cmd.find((v) => v[0] === name))

            if (val !== undefined) {
                if (relative) {
                    val += last
                }
            } else {
                val = last
            }

            return val
        }

        let lines: (string | undefined)[] = this.gCode.split("\n")
        this.gCode = "" // clear memory
       
        let currentObject = 0
        let lastAddedLinePoint: LinePoint | undefined = undefined
        let pointCount = 0
        const addLine = (newLine: LinePoint) => {
            if (pointCount > 0 && pointCount % this.pointsPerObject == 0) {
                // end the old geometry and increase the counter
                this.combinedLines[currentObject].finish()
                currentObject++
            }

            if (this.combinedLines[currentObject] === undefined) {
                this.combinedLines[currentObject] = new LineTubeGeometry(this.radialSegments)
                if (lastAddedLinePoint) {
                    this.combinedLines[currentObject].add(lastAddedLinePoint)
                }
            }

            this.combinedLines[currentObject].add(newLine)
            lastAddedLinePoint = newLine
            pointCount++
        }

        // Create the geometry.
        //this.combinedLines[oNr] = new LineTubeGeometry(this.radialSegments)
        lines.forEach((line, i)=> {
            if (line === undefined) {
                return
            }

            // Split off comments.
            line = line.split(";", 2)[0]

            const cmd = line.split(" ")
            // A move command.
            if (cmd[0] === "G0" || cmd[0] === "G1") {
                const x = getValue(cmd,"X", lastPoint.x, relative.x)
                const y = getValue(cmd,"Y", lastPoint.y, relative.y)
                const z = getValue(cmd,"Z", lastPoint.z, relative.z)
                const e = getValue(cmd,"E", lastE, relative.e)
                const f = this.parseValue(cmd.find((v) => v[0] === "F")) || lastF

                const newPoint = new Vector3(x, y, z)

                const curve = new LineCurve3(lastPoint, newPoint)
                const length = curve.getLength()

                if (length !== 0) {
                    let radius = (e - lastE) / length * 10

                    if (radius == 0) {
                        radius = this.travelWidth
                    } else {
                        // Update the bounding box.
                        this.calcMinMax(newPoint)
                    }

                    // Get the color for this line.
                    const color = this.colorizer.getColor({
                        radius,
                        segmentStart: lastPoint,
                        segmentEnd: newPoint,
                        speed: f,
                        temp: hotendTemp
                    });

                    // Insert the last point with the current radius.
                    // As the GCode contains the extrusion for the 'current' line, 
                    // but the LinePoint contains the radius for the 'next' line
                    // we need to combine the last point with the current radius.
                    addLine(new LinePoint(lastPoint.clone(), radius, color))

                    // Try to figure out the layer start and end points.
                    if (lastPoint.z !== newPoint.z) {
                        let last = layerPointsCache.get(lastPoint.z)
                        let current = layerPointsCache.get(newPoint.z)

                        if (last === undefined) {
                            last = {
                                end: 0,
                                start: 0
                            }
                        }

                        if (current === undefined) {
                            current = {
                                end: 0,
                                start: 0
                            }
                        }

                        last.end = pointCount-1
                        current.start = pointCount

                        layerPointsCache.set(lastPoint.z, last)
                        layerPointsCache.set(newPoint.z, current)
                    }
                }

                // Save the data.
                lastLastPoint.copy(lastPoint)
                lastPoint.copy(newPoint)
                lastE = e
                lastF = f

            // Set a value directly.
            } else if (cmd[0] === "G92") {
                // set state
                lastLastPoint.copy(lastPoint)
                lastPoint = new Vector3(
                    this.parseValue(cmd.find((v) => v[0] === "X")) || lastPoint.x,
                    this.parseValue(cmd.find((v) => v[0] === "Y")) || lastPoint.y,
                    this.parseValue(cmd.find((v) => v[0] === "Z")) || lastPoint.z
                )
                lastE = this.parseValue(cmd.find((v) => v[0] === "E")) || lastE

            // Hot end temperature.
            } else if (cmd[0] === "M104" || cmd[0] === "M109") {
                // M104 S205 ; start heating hot end
                // M109 S205 ; wait for hot end temperature
                hotendTemp = this.parseValue(cmd.find((v) => v[0] === "S")) || 0
            }

            lines[i] = undefined
        })

        // Finish last object
        if (this.combinedLines[currentObject]) {
            this.combinedLines[currentObject].finish()
        }
       

        // Sort the layers by starting line number.
        this.layerIndex = Array.from(layerPointsCache.values()).sort((v1, v2) => v1.start - v2.start)
        // Set the end of the last layer correctly.
        this.layerIndex[this.layerIndex.length-1].end = this.pointsCount()-1
    }

    /**
     * Slices the rendered model based on the passed start and end point numbers.
     * (0, pointsCount()) renders everything
     * 
     * Note: Currently negative values are not allowed.
     * 
     * @param {number} start the starting segment
     * @param {number} end the ending segment (excluding)
     */
    public slice(start: number = 0, end: number = this.pointsCount()) {
        console.log(start, end)
        // TODO: support negative values like the slice from Array?
        if (start < 0 || end < 0) {
            throw new Error("negative values are not supported, yet")
        }

        const objectStart = Math.floor(start / this.pointsPerObject)
        const objectEnd = Math.ceil(end / this.pointsPerObject)-1

        this.combinedLines.forEach((line, i) => {
            // Render nothing if both are the same (and not undefined)
            if (start !== undefined && start === end) {
                line.slice(0, 0)
                return
            }

            let from = 0
            let to = line.pointsCount()

            if (i == objectStart) {
                from = start - i * this.pointsPerObject
                // If it is not the first object, remove the first point from the calculation.
                if (objectStart > 0) {
                    from++
                }
            } 
            
            if (i == objectEnd) {
                to = end - i * this.pointsPerObject
                // Only if it is not the last object, add the last point to the calculation.
                if (objectEnd <= Math.floor(this.pointsCount() / this.pointsPerObject)) {
                    to++
                }
            }
            
            if (i < objectStart || i > objectEnd) {
                from = 0
                to = 0
            }

            line.slice(from, to)
        })
    }

    /**
     * Slices the rendered model based on the passed start and end line numbers.
     * (0, layerCount()) renders everything
     * 
     * Note: Currently negative values are not allowed.
     * 
     * @param {number} start the starting layer
     * @param {number} end the ending layer (excluding)
     */
    public sliceLayer(start?: number, end?: number) {
        this.slice(start && this.layerIndex[start]?.start, end && this.layerIndex[end]?.end+1)
    }

    /**
     * disposes everything which is dispose able.
     * Call this always before destroying the instance.""
     */
    public dispose() {
        this.combinedLines.forEach(e => e.dispose());
    }

    /**
     * Get the amount of points in the model.
     * 
     * @returns {number}
     */
    public pointsCount(): number {
        return this.combinedLines.reduce((count, line, i) => {
            // Do not count the first point of all objects after the first one.
            // This point is always the same as the last from the previous object.
            // The very first point is still counted -> i > 0.
            if (i > 0) {
                return count+line.pointsCount()-1
            }
            return count+line.pointsCount()
        }, 0)
    }

    /**
     * Get the amount of layers in the model.
     * This is an approximation which may be incorrect if the
     * nozzle moves downwards mid print.
     * 
     * @returns {number}
     */
    public layerCount(): number {
        // the last layer contains only the start-point, not an end point. -> -1
        return this.layerIndex.length - 1 || 0
    }

    /**
     * You can get the internal geometries generated from the gcode.
     * Use only if you know what you do.
     * @returns the internal generated geometries.
     */
    public getGeometries() {
        return this.combinedLines
    }
}