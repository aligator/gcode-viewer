import { Color, Vector3 } from "three";
import { Lut } from "three/examples/jsm/math/Lut";

export interface SegmentMetadata {
    segmentStart: Vector3
    segmentEnd: Vector3
    radius: number
    temp: number
    speed: number

    gCodeLine: number
}

const DEFAULT_COLOR = new Color("#29BEB0")

export interface SegmentColorizer {
    getColor(meta: SegmentMetadata): Color
}


export interface LineColorizerOptions {
    defaultColor: Color
}

export type LineColorConfig = {toLine: number, color: Color}[]

export class LineColorizer {
    // This assumes that getColor is called ordered by gCodeLine.
    private currentConfigIndex: number = 0

    constructor(
        private readonly lineColorConfig: LineColorConfig, 
        private readonly options?: LineColorizerOptions
    ) {}

    getColor(meta: SegmentMetadata): Color {
        // Safeguard check if the config is too short.
        if (this.lineColorConfig[this.currentConfigIndex] === undefined) {
            return this.options?.defaultColor || DEFAULT_COLOR
        }

        if (this.lineColorConfig[this.currentConfigIndex].toLine < meta.gCodeLine) {
            this.currentConfigIndex++
        }

        return this.lineColorConfig[this.currentConfigIndex].color || this.options?.defaultColor || DEFAULT_COLOR
    }
}

export class SimpleColorizer implements SegmentColorizer {
    private readonly color
    
    constructor(color = DEFAULT_COLOR) {
        this.color = color
    }

    getColor(): Color {
        return this.color
    }
}

export abstract class LutColorizer implements SegmentColorizer {
    protected readonly lut: Lut

    constructor(lut = new Lut("cooltowarm")) {
        this.lut = lut
    }

    abstract getColor(meta: SegmentMetadata): Color;
}

export class SpeedColorizer extends LutColorizer {
    constructor(minSpeed: number, maxSpeed: number) {
        super()
        this.lut.setMin(minSpeed)
        this.lut.setMax(maxSpeed)
    }

    getColor(meta: SegmentMetadata): Color {
        return this.lut.getColor(meta.speed)
    }
}

export class TempColorizer extends LutColorizer {
    constructor(minTemp: number, maxTemp: number) {
        super()
        this.lut.setMin(minTemp)
        this.lut.setMax(maxTemp)
    }

    getColor(meta: SegmentMetadata): Color {
        return this.lut.getColor(meta.temp)
    }
}