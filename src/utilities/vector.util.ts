import type { Point } from "../types/vector.types";

/** Get point along an angle by distance */
export const getPointAlongAngle = (origin: Point, angle: number, distance: number) => {
  const radian = (Math.PI / 180) * angle;
  return {
    x: origin.x + Math.cos(radian) * distance,
    y: origin.y + Math.sin(radian) * distance,
  };
};

/** Get angle between two points */
export const getAngleBetweenPoints = (to: Point, from: Point) => {
  return Math.atan2(from.y - to.y, from.x - to.x) * (180 / Math.PI);
};

/** Get distance between two points */
export const getDistanceBetweenPoints = (p1: Point, p2: Point) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};
