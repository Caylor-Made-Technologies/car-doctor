// Engine bay parts and the diagnosis -> part lookup. One table drives the 3D scene
// (app/3d/engine-bay.js) and the flat drawing shown before it loads or instead of it.
// Coordinates in meters: x = driver (-) to passenger (+), y = up, z = firewall (-) to grille (+).
(function (root) {
  "use strict";

  /** shape: box | cyl (axis y) | cylx (axis x) | cylz (axis z) | wheel. mat: key in the 3D material list. */
  const PARTS = {
    engine:      { label: "Engine",                          where: "the engine block, center of the bay",            pos: [0, 0.32, -0.05],  size: [0.62, 0.5, 0.82],  shape: "box",  mat: "iron" },
    coils:       { label: "Spark plugs & coils",             where: "on top of the engine, along each side",          pos: [0, 0.64, -0.05],  size: [0.5, 0.1, 0.7],    shape: "box",  mat: "plastic" },
    intake:      { label: "Intake & throttle body",          where: "the big air duct on top, toward the front",      pos: [0, 0.76, 0.3],    size: [0.3, 0.14, 0.42],  shape: "box",  mat: "alloy" },
    airbox:      { label: "Air filter box & MAF sensor",     where: "the black box at the front corner",              pos: [-0.62, 0.55, 0.56], size: [0.34, 0.24, 0.42], shape: "box", mat: "plastic" },
    battery:     { label: "Battery & cables",                where: "front passenger corner",                         pos: [0.66, 0.5, 0.56], size: [0.3, 0.24, 0.2],   shape: "box",  mat: "plastic" },
    radiator:    { label: "Radiator & fan",                  where: "right behind the grille",                        pos: [0, 0.36, 0.96],   size: [1.3, 0.5, 0.06],   shape: "box",  mat: "core" },
    coolant:     { label: "Coolant tank, hoses & thermostat", where: "the see-through tank and the hoses",            pos: [0.62, 0.56, -0.25], size: [0.18, 0.22, 0.26], shape: "box", mat: "translucent" },
    belt:        { label: "Belt, pulleys & water pump",      where: "the front of the engine",                        pos: [0, 0.32, 0.44],   size: [0.5, 0.42, 0.05],  shape: "box",  mat: "rubber" },
    alternator:  { label: "Alternator",                      where: "front of the engine, driven by the belt",        pos: [0.38, 0.5, 0.42], size: [0.17, 0.17, 0.17], shape: "cylz", mat: "alloy" },
    ac:          { label: "A/C compressor & condenser",      where: "low on the front of the engine",                 pos: [-0.38, 0.16, 0.42], size: [0.17, 0.17, 0.2], shape: "cylz", mat: "alloy" },
    starter:     { label: "Starter",                         where: "low on the side, where engine meets transmission", pos: [-0.38, 0.02, -0.42], size: [0.13, 0.13, 0.28], shape: "cylz", mat: "steel" },
    exhaust:     { label: "Exhaust & catalytic converter",   where: "the pipes leaving the engine, under the vehicle", pos: [-0.42, 0.22, -0.1], size: [0.07, 0.07, 0.7], shape: "cylz", mat: "rust" },
    turbo:       { label: "Turbocharger",                    where: "on the exhaust side of the engine",              pos: [-0.5, 0.5, 0.18], size: [0.18, 0.18, 0.18], shape: "cylx", mat: "steel" },
    fuel:        { label: "Fuel system",                     where: "the fuel rail on top; pump and cap at the tank",  pos: [0.2, 0.62, -0.05], size: [0.05, 0.05, 0.62], shape: "cylz", mat: "steel" },
    oil:         { label: "Oil pan & seals",                 where: "under the engine",                               pos: [0, 0.0, -0.05],   size: [0.5, 0.14, 0.62],  shape: "box",  mat: "steel" },
    transmission:{ label: "Transmission",                    where: "behind the engine, under the cab",               pos: [0, 0.14, -0.72],  size: [0.36, 0.36, 0.5],  shape: "box",  mat: "alloy" },
    driveline:   { label: "Axles, differential & 4WD",       where: "under the vehicle, between the wheels",          pos: [0, -0.22, 0.3],   size: [1.7, 0.08, 0.08],  shape: "cylx", mat: "steel" },
    steering:    { label: "Steering & power steering",       where: "low in front, linking the front wheels",         pos: [0, -0.06, 0.58],  size: [1.4, 0.06, 0.06],  shape: "cylx", mat: "steel" },
    brakes:      { label: "Front brakes",                    where: "behind the front wheels (pads, rotors, calipers)", pos: [-1.0, 0.0, 0.3], size: [0.06, 0.5, 0.5], shape: "cylx", mat: "steel" },
    brakefluid:  { label: "Brake master cylinder & lines",   where: "on the firewall, driver side",                   pos: [-0.62, 0.62, -0.82], size: [0.22, 0.12, 0.14], shape: "box", mat: "alloy" },
    abs:         { label: "ABS module & wheel sensors",      where: "near the brake master cylinder and each wheel",  pos: [-0.62, 0.38, -0.62], size: [0.16, 0.14, 0.14], shape: "box", mat: "plastic" },
    wheel:       { label: "Wheel, tire & suspension",        where: "the front wheels, hubs and springs",             pos: [1.06, 0.0, 0.3],  size: [0.26, 0.76, 0.76], shape: "wheel", mat: "rubber" },
    body:        { label: "Body & frame",                    where: "fenders, rockers and frame rails",               pos: [0, -0.16, -0.1],  size: [1.9, 0.08, 2.1],   shape: "box",  mat: "paint" },
    cabin:       { label: "Inside the cab",                  where: "behind the firewall: dash, wiring and controls", pos: [0, 0.42, -1.02], size: [1.9, 0.6, 0.05],   shape: "box",  mat: "paint" },
  };

  /** Every diagnosis the model knows -> the part to show. Anything else falls back to "unknown". */
  const DIAGNOSIS_PART = {
    abs_sensor_problem: "abs", ac_problem: "ac", adas_problem: "cabin", air_suspension_problem: "wheel",
    alignment_problem: "wheel", bad_alternator: "alternator", bad_motor_mounts: "engine", bad_starter: "starter",
    bad_wheel_bearing: "wheel", blend_door_actuator: "cabin", blower_motor_problem: "cabin", brake_fluid_leak: "brakefluid",
    catalytic_converter_problem: "exhaust", clutch_problem: "transmission", collapsed_lifter: "engine", cvt_problem: "transmission",
    dead_battery: "battery", death_wobble: "steering", diesel_emissions_problem: "exhaust", differential_problem: "driveline",
    dirty_maf_sensor: "airbox", door_lock_problem: "cabin", electrical_ground_problem: "battery", engine_knock: "engine",
    engine_misfire: "coils", evap_leak: "fuel", exhaust_leak: "exhaust", four_wheel_drive_problem: "driveline",
    fuel_delivery_problem: "fuel", head_gasket_failure: "engine", heater_core_problem: "cabin", hybrid_ev_problem: "unknown",
    infotainment_problem: "cabin", instrument_cluster_problem: "cabin", key_ignition_problem: "cabin", low_tire_pressure: "wheel",
    oil_burning: "engine", oil_leak_low_oil: "oil", overheating: "radiator", power_steering_problem: "steering",
    rust_damage: "body", sticking_brake_caliper: "brakes", thermostat_stuck_open: "coolant", throttle_body_problem: "intake",
    timing_chain_problem: "engine", tire_balance: "wheel", torque_converter_shudder: "transmission", transmission_problem: "transmission",
    turbo_problem: "turbo", vacuum_leak: "intake", warped_rotors: "brakes", water_leak_inside: "cabin",
    water_pump_failure: "belt", window_regulator_problem: "cabin", worn_brake_pads: "brakes", worn_cv_axle: "driveline",
    worn_serpentine_belt: "belt", worn_suspension: "wheel", worn_u_joint: "driveline",
  };

  /** The part for a diagnosis label, or "unknown" (never throws, never returns a missing part). */
  function partFor(label) {
    const id = Object.prototype.hasOwnProperty.call(DIAGNOSIS_PART, label) ? DIAGNOSIS_PART[label] : "unknown";
    return Object.prototype.hasOwnProperty.call(PARTS, id) ? id : "unknown";
  }

  const api = { PARTS, DIAGNOSIS_PART, partFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CarParts = api;
})(typeof self !== "undefined" ? self : this);
