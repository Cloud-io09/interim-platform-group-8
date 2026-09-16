import { describe, expect, it } from "vitest";
import { distanceKm } from "../src/geo";

const REIMS = { lat: 49.2628, lon: 4.0347 };
const PARIS = { lat: 48.8566, lon: 2.3522 };
const TOULOUSE = { lat: 43.6045, lon: 1.444 };

describe("distanceKm", () => {
  it("rend 0 entre un point et lui-même", () => {
    expect(distanceKm(REIMS, REIMS)).toBe(0);
  });

  it("mesure Reims–Paris à environ 130 km", () => {
    expect(distanceKm(REIMS, PARIS)).toBeGreaterThan(125);
    expect(distanceKm(REIMS, PARIS)).toBeLessThan(135);
  });

  it("mesure Reims–Toulouse à environ 660 km", () => {
    expect(distanceKm(REIMS, TOULOUSE)).toBeGreaterThan(645);
    expect(distanceKm(REIMS, TOULOUSE)).toBeLessThan(675);
  });

  it("est symétrique", () => {
    expect(distanceKm(REIMS, PARIS)).toBeCloseTo(distanceKm(PARIS, REIMS));
  });

  it("gère les longitudes négatives (ouest de Greenwich)", () => {
    const brest = { lat: 48.405, lon: -4.5075 };
    expect(distanceKm(PARIS, brest)).toBeGreaterThan(500);
    expect(distanceKm(PARIS, brest)).toBeLessThan(520);
  });
});
