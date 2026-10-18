// Duct physics for the parts HVAC Grid computes itself (vertical ducts between decks); the deck networks are sized and
// calculated by PHG D. Same basis as PHG D's simple pressure settings: air 1.2 kg/m³, viscosity 1.81e-5 Pa·s, galvanised
// steel roughness 0.09 mm, Darcy-Weisbach with Colebrook friction, rectangular ducts by hydraulic diameter.
'use strict';

const AIR = Object.freeze({ densityKgM3: 1.2, viscosityPaS: 1.81e-5, roughnessMm: 0.09 });
// riser sizing: velocity limit of a main duct (PHG D main default 10 m/s) and at most 2 Pa/m friction, sizes in 50 mm
// steps, aspect <= 4
const RISER_RULES = Object.freeze({ maxVelocityMps: 10, maxFrictionPaM: 2, stepMm: 50, minSideMm: 100, maxAspect: 4, elbowK: 0.25, elbowsPerRiser: 2 });

const areaOf = d => d.diameterMm ? Math.PI * (d.diameterMm / 1000) ** 2 / 4 : (d.widthMm / 1000) * (d.heightMm / 1000);
// hydraulic diameter in m: 4A/P (round: D)
const hydraulicM = d => d.diameterMm ? d.diameterMm / 1000 : 2 * (d.widthMm / 1000) * (d.heightMm / 1000) / ((d.widthMm + d.heightMm) / 1000);
const velocityMps = (flowCmh, d) => flowCmh / 3600 / areaOf(d);
const dynamicPa = (v, air = AIR) => air.densityKgM3 * v * v / 2;

// Colebrook-White, solved by fixed-point iteration from the Haaland start value; laminar below Re 2300
function friction(re, relRough) {
 if (re <= 0) return 0;
 if (re < 2300) return 64 / re;
 let f = (-1.8 * Math.log10((relRough / 3.7) ** 1.11 + 6.9 / re)) ** -2;
 for (let i = 0; i < 30; i++) { const n = (-2 * Math.log10(relRough / 3.7 + 2.51 / (re * Math.sqrt(f)))) ** -2; if (Math.abs(n - f) < 1e-12) { f = n; break; } f = n; }
 return f;
}
// pressure loss per metre (Pa/m) of a straight duct
function frictionPaPerM(flowCmh, d, air = AIR) {
 const v = velocityMps(flowCmh, d), Dh = hydraulicM(d), re = air.densityKgM3 * v * Dh / air.viscosityPaS;
 return friction(re, air.roughnessMm / 1000 / Dh) / Dh * dynamicPa(v, air);
}

// smallest rectangular duct (stepMm grid, aspect <= maxAspect, prefer square-ish) within the velocity and friction limits
function sizeRect(flowCmh, rules = RISER_RULES) {
 const need = flowCmh / 3600 / rules.maxVelocityMps; let best = null;
 for (let h = rules.minSideMm; h <= 2000; h += rules.stepMm) for (let w = h; w <= h * rules.maxAspect && w <= 3000; w += rules.stepMm) {
  const a = w * h / 1e6; if (a + 1e-12 < need || (rules.maxFrictionPaM && frictionPaPerM(flowCmh, { widthMm: w, heightMm: h }) > rules.maxFrictionPaM)) continue;
  if (!best || a < best.a - 1e-12 || (Math.abs(a - best.a) < 1e-12 && w / h < best.w / best.h)) best = { w, h, a };
  break;   // for this height the first width that fits is the smallest
 }
 return best ? { widthMm: best.w, heightMm: best.h } : { widthMm: 3000, heightMm: 2000 };
}

// one straight duct with elbows: friction + elbow losses
function segmentLoss(flowCmh, d, lengthM, elbows = 0, rules = RISER_RULES, air = AIR) {
 const v = velocityMps(flowCmh, d), fr = frictionPaPerM(flowCmh, d, air) * lengthM, el = elbows * rules.elbowK * dynamicPa(v, air);
 return { velocityMps: v, frictionPa: fr, elbowPa: el, totalPa: fr + el };
}

module.exports = { AIR, RISER_RULES, areaOf, hydraulicM, velocityMps, dynamicPa, friction, frictionPaPerM, sizeRect, segmentLoss };
