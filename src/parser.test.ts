import { GCodeParser } from './parser'

describe("GCodeParser", () => {
    describe("slice", () => {
        const radialSegments = 5

        /**
         * Helper function to calculate the amount of indices
         */
        function countExpected(radialSegments: number, segmentCount: number, withStart: boolean, withEnd: boolean)  {
            let res = (radialSegments + 1) * 6 * 2 * segmentCount
            if (withStart) {
                res += (radialSegments * 6)
            }

            if (!withEnd) {
                res -= (radialSegments * 6)
            }
            return res
        }

        describe.each<{
            name: string
            gcode: string
            pointsPerObject: number
            sliceStart?: number
            sliceEnd?: number
            expectedCount?: number[]
            expectedError?: string
        }>([{
            name: "no start / end",
            gcode: 
`;LAYER:0
;Generated with GoSlice
;______________________
M107 ; disable fan
;SET_INITIAL_TEMP
M104 S205 ; start heating hot end
M190 S60 ; heat and wait for bed
M109 S205 ; wait for hot end temperature
;START_GCODE
G1 Z5 F5000 ; lift nozzle
G92 E0 ; reset extrusion distance
;TYPE:SKIRT
G0 X111.78 Y83.52 Z0.20 F9000
G1 X112.30 Y83.53 F1800 E0.0173
G1 X112.81 Y83.59 E0.0343
G1 X113.59 Y83.76 E0.0607
G1 X114.18 Y83.96 E0.0814
G1 X115.08 Y84.39 E0.1148
G1 X115.08 Y84.39 E0.1148
G1 X115.08 Y84.39 E0.1148
G1 X115.08 Y84.39 E0.1148
`,
            pointsPerObject: 4,
            expectedCount: [
                countExpected(radialSegments, 4, true, true), 
                countExpected(radialSegments, 4, true, true),
            ],
        }])("with values", (t) => {
            test(t.name, async () => {
                const lt = new GCodeParser(t.gcode)
                lt.pointsPerObject = t.pointsPerObject
                await lt.parse()

                const errorTest = () => {
                    lt.slice(t.sliceStart, t.sliceEnd)
                }
                
                if (t.expectedError) {
                    expect(errorTest).toThrowError(t.expectedError)
                    return
                } else {
                    expect(errorTest).not.toThrowError()
                }

                if (t.expectedCount === undefined) {
                    return
                }
                expect(lt.getGeometries().length).toBe(t.expectedCount.length)

                lt.getGeometries().forEach((g, i) => {
                    if (t.expectedCount === undefined) {
                        return
                    }
                    expect(g.getIndex()?.count).toBe(t.expectedCount[i])
                })
            })
        })
    })
})