import { Vector3 } from 'three'
import { LinePoint } from './LinePoint'
import { LineTubeGeometry } from './LineTubeGeometry'

describe("LineTube", () => {
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
            points: LinePoint[]
            sliceStart?: number
            sliceEnd?: number
            expectedCount?: number
            expectedError?: string
        }>([{
            name: "middle - one segment",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedCount: countExpected(radialSegments, 1, false, false),
            sliceStart: 1,
            sliceEnd: 3
        },{
            name: "no start / end",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedCount: countExpected(radialSegments, 4, true, true),
        },{
            name: "no end",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedCount: countExpected(radialSegments, 2, false, true),
            sliceStart: 2
        },{
            name: "no start",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedCount: countExpected(radialSegments, 2, false, true),
            sliceEnd: 3
        },{
            name: "negative start",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedError: "negative values are not supported, yet",
            sliceStart: -1
        },{
            name: "negative end",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedError: "negative values are not supported, yet",
            sliceEnd: -1
        },{
            name: "smaller end than start",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedCount: 0,
            sliceStart: 3,
            sliceEnd: 2
        },{
            name: "min & max as start & end",
            points: [
                new LinePoint(new Vector3(0, 0, 0), 1),
                new LinePoint(new Vector3(1, 0, 0), 1),
                new LinePoint(new Vector3(1, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 0), 1),
                new LinePoint(new Vector3(0, 1, 1), 1)
            ],
            expectedCount: countExpected(radialSegments, 4, true, true),
            sliceStart: 0,
            sliceEnd: 5
        }])("with values", (t) => {
            test(t.name, () => {
                const lt = new LineTubeGeometry(5)

                t.points.forEach((p) => {
                    lt.add(p)
                })
                lt.finish()

                const errorTest = () => {
                    lt.slice(t.sliceStart, t.sliceEnd)
                }
                
                if (t.expectedError) {
                    expect(errorTest).toThrowError(t.expectedError)
                    return
                } else {
                    expect(errorTest).not.toThrowError()
                }

                expect(lt.getIndex()?.count).toBe(t.expectedCount)
            })
        })
    })
})