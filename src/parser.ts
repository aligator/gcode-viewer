import {
    Vector3
} from 'three'
import { LineTubeGeometry } from "./LineTubeGeometry";
import { LinePoint } from "./LinePoint";
import { SegmentColorizer, SimpleColorizer } from './SegmentColorizer';

function getLength(lastPoint: Vector3, newPoint: Vector3) {
    const distant = (lastPoint.x - newPoint.x) ** 2 + (lastPoint.y - newPoint.y) ** 2 + (lastPoint.z - newPoint.z) ** 2;
    return distant ** 0.5;
}

/**
 * Parses a string cmd value.
 * The first char has to be a letter.
 * If value is not set (undefined | "") or if the resulting number is NaN,
 * the default value is returned.
 *
 * If the defaultValue is a number, the result can never be undefined due to type constraints.
 *
 * @param value
 * @param defaultValue {number | undefined} may be any number or undefined.
 * @returns if the defaultValue is undefined, this can be undefined. Else it will always be a number.
 */
function parseValue<DefaultType extends number | undefined>(value: string | undefined, defaultValue: DefaultType): number | DefaultType {
    if (!value) {
        return defaultValue
    }
    const parsedValue = Number.parseFloat(value.substring(1))
    return Number.isNaN(parsedValue) ? defaultValue : parsedValue
}


/**
 * Recalculate the bounding box with the new point.
 * @param {Vector3} newPoint
 */
function calcMinMax(min: Vector3 | undefined, max: Vector3 | undefined, newPoint: Vector3): { min?: Vector3, max?: Vector3 } {
    const result = { min, max }

    if (result.min === undefined) {
        result.min = newPoint.clone()
    }
    if (result.max === undefined) {
        result.max = newPoint.clone()
    }

    if (newPoint.x >  result.max.x) {
        result.max.x = newPoint.x
    }
    if (newPoint.y > result.max.y) {
        result.max.y = newPoint.y
    }
    if (newPoint.z > result.max.z) {
        result.max.z = newPoint.z
    }

    if (newPoint.x <  result.min.x) {
        result.min.x = newPoint.x
    }
    if (newPoint.y <  result.min.y) {
        result.min.y = newPoint.y
    }
    if (newPoint.z <  result.min.z) {
        result.min.z = newPoint.z
    }

    return result
}

export interface LayerDefinition {
    start: number,
    end: number,
}

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


    // Public configurations:

    /**
     * Contains the start and end-point of each layer.
     * IMPORTANT: Do NOT MODIFY this array or it's , as it is used internally!
     * It is only meant to be read.
     */
    public layerDefinition: LayerDefinition[] = []

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
                const f = parseValue(cmd.find((v) => v[0] === "F"), undefined)

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
                const hotendTemp = parseValue(cmd.find((v) => v[0] === "S"), 0)

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
        let lastPoint: Vector3 = new Vector3(0, 0, 0);
        let lastE = 0;
        let lastF = 0;
        let hotendTemp = 0;

        const getValue = (cmd: string[], name: string, last: number, relative: boolean): number => {
            let val = parseValue(cmd.find((v) => v[0] === name), undefined);
            if (val !== undefined && relative) {
                val += last;
            } else if (val === undefined) {
                val = last;
            }

            if (Number.isNaN(val)) {
                throw new Error(`could not read the value in cmd '${cmd}'`);
            }
            return val;
        };

        let lines: (string | undefined)[] = this.gCode.split("\n");
        this.gCode = ""; // clear memory

        let currentObject = 0;
        let lastAddedLinePoint: LinePoint | undefined = undefined;
        let pointCount = 0;
        const addLine = (newLine: LinePoint) => {
            if (pointCount > 0 && pointCount % this.pointsPerObject === 0) {
                this.combinedLines[currentObject].finish();
                currentObject++;
            }

            if (this.combinedLines[currentObject] === undefined) {
                this.combinedLines[currentObject] = new LineTubeGeometry(this.radialSegments);
                if (lastAddedLinePoint) {
                    this.combinedLines[currentObject].add(lastAddedLinePoint);
                }
            }
            this.combinedLines[currentObject].add(newLine);
            lastAddedLinePoint = newLine;
            pointCount++;
        };

        function* lineGenerator(travelWidth: number, colorizer: SegmentColorizer): Generator<{ point: LinePoint, min?: Vector3, max?: Vector3, lineNumber: number }> {
            let min: Vector3 | undefined;
            let max: Vector3 | undefined;
            let currentLayerIndex: number | undefined;

            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                let line = lines[lineNumber];

                if (line === undefined) {
                    return;
                }

                if (line.includes(";LAYER:")) {
                    let layerIndex = parseInt(line.split(":")[1]);
                    if (!Number.isNaN(layerIndex)) {
                        if (currentLayerIndex !== undefined) {
                            let layerCache = layerPointsCache.get(currentLayerIndex);
                            if (layerCache) {
                                layerCache.end = pointCount - 1;
                            }
                        }
                        currentLayerIndex = layerIndex;
                        layerPointsCache.set(layerIndex, { start: pointCount, end: 0 });
                    }
                    continue;
                }

                line = line.split(";", 2)[0]; // split comments
                const cmd = line.split(" ");
                if (cmd[0] === "G0" || cmd[0] === "G1") {
                    const x = getValue(cmd, "X", lastPoint.x, relative.x);
                    const y = getValue(cmd, "Y", lastPoint.y, relative.y);
                    const z = getValue(cmd, "Z", lastPoint.z, relative.z);
                    const e = getValue(cmd, "E", lastE, relative.e);
                    const f = parseValue(cmd.find((v) => v[0] === "F"), lastF);

                    const newPoint = new Vector3(x, y, z);
                    const length = getLength(lastPoint, newPoint);

                    if (length !== 0) {
                        let radius = (e - lastE) / length * 10;
                        if (radius < 0) {
                            radius = 0;
                        }
                        if (radius === 0) {
                            radius = travelWidth;
                        } else {
                            const { min: newMin, max: newMax } = calcMinMax(min, max, newPoint);
                            min = newMin;
                            max = newMax;
                        }

                        const color = colorizer.getColor({
                            radius,
                            segmentStart: lastPoint,
                            segmentEnd: newPoint,
                            speed: f,
                            temp: hotendTemp,
                            gCodeLine: lineNumber,
                        });

                        yield { min, max, point: new LinePoint(lastPoint.clone(), radius, color), lineNumber };
                    }

                    lastPoint.copy(newPoint);
                    lastE = e;
                    lastF = f;
                } else if (cmd[0] === "G92") {
                    lastPoint = new Vector3(
                        parseValue(cmd.find((v) => v[0] === "X"), lastPoint.x),
                        parseValue(cmd.find((v) => v[0] === "Y"), lastPoint.y),
                        parseValue(cmd.find((v) => v[0] === "Z"), lastPoint.z),
                    );
                    lastE = parseValue(cmd.find((v) => v[0] === "E"), lastE);
                } else if (cmd[0] === "M104" || cmd[0] === "M109") {
                    hotendTemp = parseValue(cmd.find((v) => v[0] === "S"), 0);
                } else if (cmd[0] === "G90") {
                    relative.x = false;
                    relative.y = false;
                    relative.z = false;
                    relative.e = false;
                } else if (cmd[0] === "G91") {
                    relative.x = true;
                    relative.y = true;
                    relative.z = true;
                    relative.e = true;
                } else if (cmd[0] === "M82") {
                    relative.e = false;
                } else if (cmd[0] === "M83") {
                    relative.e = true;
                } else if (cmd[0] === "G20") {
                    throw new Error("inch values not implemented yet");
                }

                lines[lineNumber] = undefined;
            }
        }

        let gen = lineGenerator(this.travelWidth, this.colorizer);
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        for (let job of gen) {
            this.min = job.min;
            this.max = job.max;
            addLine(job.point);

            if (job.lineNumber % 200 === 1) {
                await delay(0);
            }
        }

        if (this.combinedLines[currentObject]) {
            this.combinedLines[currentObject].finish();
        }

        this.layerDefinition = Array.from(layerPointsCache.values()).sort((v1, v2) => v1.start - v2.start);
        this.layerDefinition[this.layerDefinition.length - 1].end = this.pointsCount() - 1;
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
        this.slice(start && this.layerDefinition[start]?.start, end && this.layerDefinition[end]?.end+1)
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
        return this.layerDefinition.length - 1 || 0
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
