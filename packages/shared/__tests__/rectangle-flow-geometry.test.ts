import { describe, expect, it } from "vitest";
import { rectangleCornerRadius, rectanglePort } from "../src/components/flows/rectangle-geometry";

describe("rectangle flow endpoints", () => {
  const rect = { left: 10, top: 20, width: 120, height: 80 };

  it("keeps straight side ports centered and offsets curved ports by entity width", () => {
    expect(rectanglePort(rect, "right", 0).point).toEqual({ x: 130, y: 60 });
    expect(rectanglePort(rect, "right", 15 / 114)).toEqual({
      point: { x: 130, y: 75.78947368421052 },
      normal: { x: 1, y: 0 },
    });
  });

  it("offsets top and bottom ports horizontally from the edge center", () => {
    const port = rectanglePort(rect, "bottom", -15 / 114);
    expect(port.point.x).toBeCloseTo(54.21, 2);
    expect(port.point.y).toBe(100);
    expect(port.normal).toEqual({ x: 0, y: 1 });
  });

  it("uses half the shortest rectangle side as the requested corner radius", () => {
    expect(rectangleCornerRadius(rect, { left: 0, top: 0, width: 100, height: 70 })).toBe(35);
  });
});
