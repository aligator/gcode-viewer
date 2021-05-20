import { GCodeParser } from './parser'

describe("GCodeParser", () => {
    describe("slice", () => {
        const gCode14Points = `
G1 Z5 F5000 ; lift nozzle
G0 X111.78 Y83.52 Z0.20 F9000
G1 X112.30 Y83.53 F1800 E0.0173
G1 X112.81 Y83.59 E0.0343

G1 X113.59 Y83.76 E0.0607
G1 X114.18 Y83.96 E0.0814
G1 X115.08 Y84.39 E0.1148
G1 X116.08 Y84.39 E0.1148

G1 X113.59 Y83.76 E0.0607
G1 X114.18 Y83.96 E0.0814
G1 X115.08 Y84.39 E0.1148
G1 X116.08 Y84.39 E0.1148

G1 X115.08 Y86.39 E0.1148
G1 X117.08 Y84.39 E0.1148
`
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
        }>([
            {
            name: "no start / end",
            gcode: gCode14Points,
            pointsPerObject: 4,
            expectedCount: [
                // Note that the first one contains 4 points and the following ones the last point from the previous + the next (up to) 4 points
                countExpected(radialSegments, 3, true, true), // line from point 1 - 2 - 3 - 4
                countExpected(radialSegments, 4, true, true), // line from point 4 - 5 - 6 - 7 - 8
                countExpected(radialSegments, 4, true, true), // line from point 8 - 9 - 10- 11- 12
                countExpected(radialSegments, 2, true, true), // line from point 12- 13- 14
            ],
        },{
            name: "partial first object",
            gcode: gCode14Points,
            pointsPerObject: 4,
            expectedCount: [
                countExpected(radialSegments, 1, false, true), // line from point 3 - 4
                countExpected(radialSegments, 4, true, true), // line from point 4 - 5 - 6 - 7 - 8
                countExpected(radialSegments, 4, true, true), // line from point 8 - 9 - 10- 11- 12
                countExpected(radialSegments, 2, true, true), // line from point 12- 13- 14
            ],
            sliceStart: 2
        },{
            name: "no first object",
            gcode: gCode14Points,
            pointsPerObject: 4,
            expectedCount: [
                countExpected(radialSegments, 0, false, true), // line from point 
                countExpected(radialSegments, 4, true, true), // line from point 4 - 5 - 6 - 7 - 8
                countExpected(radialSegments, 4, true, true), // line from point 8 - 9 - 10- 11- 12
                countExpected(radialSegments, 2, true, true), // line from point 12- 13- 14
            ],
            sliceStart: 3
        },
        {
            name: "partial second object",
            gcode: gCode14Points,
            pointsPerObject: 4,
            expectedCount: [
                countExpected(radialSegments, 0, false, true), // line from point 
                countExpected(radialSegments, 3, false, true), // line from point 5 - 6 - 7 - 8
                countExpected(radialSegments, 4, true, true), // line from point 8 - 9 - 10- 11- 12
                countExpected(radialSegments, 2, true, true), // line from point 12- 13- 14
            ],
            sliceStart: 4
        }])("with values", (t) => {
            test(t.name, async () => {
                const lt = new GCodeParser(t.gcode)
                lt.radialSegments = radialSegments
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