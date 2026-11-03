import { describe, expect, it } from "vitest";
import { geoMercator } from "d3-geo";
import { MAP_VIEWS } from "@/lib/belgiansMapViews";

describe("cadrage de la carte panoramique", () => {
  it("garde les repères européens visibles du Portugal au nord de la Norvège", () => {
    const projection = geoMercator().scale(130).translate([500, 180]);
    const view = MAP_VIEWS.europe;
    const center = projection(view.center);
    for (const point of [[-9, 38], [29, 41], [25, 71], [-5, 55]]) {
      const projected = projection(point);
      const x = 500 + (projected[0] - center[0]) * view.zoom;
      const y = 180 + (projected[1] - center[1]) * view.zoom;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1000);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(360);
    }
  });
});
