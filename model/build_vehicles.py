"""
Car Doctor - known problems by vehicle.

Builds app/vehicles.json: common US makes and models from 2000 on, with the
problems each one is widely known for (recalls, warranty extensions, and
failures mechanics see over and over).

Run from the repo root:
    python model/build_vehicles.py

How it's organized:
  ISSUES  - named groups of problems. Vehicles that share parts share a group
            (a GMC Sierra uses the same truck groups as a Chevy Silverado).
  MODELS  - (make, model, first year, last year, [groups], [other names])

  data/us_vehicles.json - 674 vehicle generations sold in the US since 2000
            (make, model, years, engines, common problem titles). Each title
            gets plain-English signs and a fix from model/problem_rules.py.
            Problems already in ISSUES for the same vehicle aren't repeated.

Each problem is I(title, symptoms, what to do, related cause):
  - Keep the words plain and short. Someone who doesn't know cars should get it.
  - "cause" must be a key from app/causes.json (or None if none fits).
    It lets the app connect a diagnosis to "this is common on your vehicle".
  - These are COMMONLY REPORTED problems, not a promise your vehicle has them.
"""

import json
import re
from pathlib import Path

from problem_rules import RULES, classify, with_recall

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "vehicles.json"
DATASET = ROOT / "data" / "us_vehicles.json"
LAST_YEAR = 2026  # "present" in the dataset


def I(title, symptoms, todo, cause):
    return {"t": title, "s": symptoms, "w": todo, "c": cause}


ISSUES = {
    # ------------------------------------------------------------------ GM
    "gm_ls_v8": [
        I("Broken exhaust manifold bolts", "A ticking or puffing sound when the engine is cold that fades as it warms up.",
          "A shop drills out the broken bolts and replaces the gasket. Not urgent unless it gets loud or you smell exhaust.", "exhaust_leak"),
        I("Corroded knock sensors", "Check engine light with codes P0327 or P0332. Usually runs fine.",
          "The sensors sit under the intake manifold, so it's mostly labor. Replace the sensors and their wiring harness together.", "engine_misfire"),
        I("Oil pressure sensor leak or bad reading", "Oil gauge drops to zero or jumps around, or oil leaks at the back of the engine.",
          "Check the oil level first. If it's full, the sensor (behind the intake) is usually the problem, not the engine.", "oil_leak_low_oil"),
    ],
    "gm_afm": [
        I("Active Fuel Management lifter failure (V8 cylinder shutoff)", "Ticking that gets louder, misfire codes, rough running, a check engine light.",
          "Get it checked soon. A collapsed lifter can damage the camshaft. Many owners add an AFM disabler after the repair.", "collapsed_lifter"),
        I("Oil burning (AFM engines)", "Needing to add a quart of oil between changes, fouled spark plugs.",
          "Check the oil every fill-up. Shops can replace the PCV/oil deflector parts or piston rings in bad cases.", "oil_burning"),
    ],
    "gm_truck_9907": [
        I("Instrument cluster gauges stick or die", "Speedometer, fuel or temp needles stick, jump, or drop to zero.",
          "The gauge motors on the circuit board wear out. A cluster repair service fixes it for much less than a new cluster.", "instrument_cluster_problem"),
        I("Fuel pump failure", "Long crank before starting, sputtering under load, or cranks but won't start.",
          "Test fuel pressure (about 55 to 62 psi). The pump is in the tank, so replace the fuel filter and pump together.", "fuel_delivery_problem"),
        I("Rusted brake lines", "Soft or sinking brake pedal, brake fluid on the frame rail or above the gas tank.",
          "Don't drive it. Brake lines rust through on these trucks; replace the whole line, not just the leak.", "brake_fluid_leak"),
        I("Worn idler and pitman arms", "Loose, wandering steering, a clunk when turning the wheel parked.",
          "Cheap parts. Replace them and get an alignment. Lifted trucks and big tires wear them faster.", "worn_suspension"),
        I("Heater blend door clicking", "Clicking behind the dash, or air only hot or only cold on one side.",
          "The small blend door motor behind the dash fails. It's an inexpensive part.", "blend_door_actuator"),
    ],
    "gm_4l60e": [
        I("4L60-E transmission wear", "Slips or loses 3rd/4th gear, flares between shifts, late or harsh shifts.",
          "Check the fluid first. A worn 3-4 clutch pack is common; a rebuild is usually the fix.", "transmission_problem"),
    ],
    "gm_truck_0714": [
        I("Steering shaft clunk", "A clunk or knock felt in the steering wheel when turning slowly or parked.",
          "The intermediate steering shaft needs grease or replacement. A common, cheap fix.", "worn_suspension"),
        I("A/C condenser leaks", "A/C blows warm, then cold after a recharge, then warm again.",
          "The condenser up front is easily punctured. Have the leak found before paying for another recharge.", "ac_problem"),
        I("Rusted rear brake lines", "Soft brake pedal, fluid near the rear axle or along the frame.",
          "Don't drive it. Replace the line and check the others.", "brake_fluid_leak"),
        I("6-speed (6L80) torque converter shudder", "A shake like driving over rumble strips at 30 to 50 mph.",
          "A fluid exchange with the updated fluid often fixes it; if not, the torque converter is replaced.", "torque_converter_shudder"),
    ],
    "gm_truck_1418": [
        I("8-speed (8L90/8L45) shudder and harsh shifts", "Shudder like rumble strips, clunky or jerky shifts at low speed.",
          "GM released a fluid change fix (2015 to 2019). Ask a dealer to check for updates on your VIN.", "torque_converter_shudder"),
        I("A/C condenser leaks", "A/C stops blowing cold, often within a few years.",
          "The condenser is easily damaged. Find the leak before recharging.", "ac_problem"),
    ],
    "gm_truck_19up": [
        I("Lifter failure on 5.3L and 6.2L V8 (cylinder shutoff)", "Ticking, misfire codes, rough running, check engine light.",
          "Get it in soon; a failed lifter can wreck the camshaft. Check for recalls and warranty coverage.", "collapsed_lifter"),
        I("6.2L engine recall (2021 to 2024)", "Knocking from the engine, low oil pressure, or the engine shutting off.",
          "Check your VIN for the 6.2L (L87) recall at nhtsa.gov/recalls or a dealer. Stop driving if it knocks.", "engine_knock"),
        I("10-speed transmission harsh shifts", "Clunky or jerky shifts, especially at low speed.",
          "Ask a dealer about software updates and a transmission 'relearn'.", "transmission_problem"),
    ],
    "gm_duramax_lb7": [
        I("Leaking diesel injectors (LB7, 2001 to 2004)", "White or black smoke, rough running, fuel in the oil (oil level rising).",
          "Injectors were covered by a long warranty; now they're replaced as a set. Don't ignore fuel in the oil.", "fuel_delivery_problem"),
    ],
    "gm_duramax_cp4": [
        I("CP4 fuel pump failure (LML Duramax, 2011 to 2016)", "Sudden stall or no start, metal shavings in the fuel system.",
          "Expensive when it fails. Use clean, quality diesel and change fuel filters on time; some owners install a pump protection kit.", "fuel_delivery_problem"),
    ],
    "gm_trailblazer": [
        I("Fan clutch failure", "Running hot at idle or in traffic, a loud roaring fan.",
          "The engine fan clutch locks up or slips. A common, moderate repair.", "overheating"),
        I("Instrument cluster and fuel gauge problems", "Gauges stick or read wrong; fuel gauge shows empty with gas in the tank.",
          "Gauge motors and the fuel level sensor (in the tank) are common failures.", "instrument_cluster_problem"),
        I("HVAC actuator clicking", "Clicking behind the dash, air won't switch vents or temperature.",
          "The small door motors behind the dash fail. Inexpensive part.", "blend_door_actuator"),
    ],
    "gm_34_38_v6": [
        I("Intake manifold gasket coolant leak (3.1/3.4/3.8L V6)", "Losing coolant with no puddle, sweet smell, overheating, milky oil in bad cases.",
          "Fix it early. Left alone, coolant mixes with oil and ruins the engine bearings.", "overheating"),
    ],
    "gm_24_ecotec": [
        I("Oil burning (2.4L, about 2010 to 2015)", "Oil runs low between changes; oil light comes on.",
          "GM extended the warranty on many. Check oil every fill-up; piston rings are the fix.", "oil_burning"),
        I("Timing chain stretch (2.4L)", "Rattle at startup, codes P0008 or P0016.",
          "Usually caused by low oil. Replace the chain, guides and tensioner, and keep the oil full.", "timing_chain_problem"),
    ],
    "gm_36_v6": [
        I("Timing chain stretch (3.0/3.6L V6, about 2007 to 2012)", "Check engine light with P0008/P0017/P0018, rattle at startup, rough running.",
          "A big job (engine partly apart). Changing oil on time is the best prevention.", "timing_chain_problem"),
    ],
    "gm_lambda": [
        I("6-speed transmission wave plate failure", "Loses 3rd, 5th and reverse gears, or goes into limp mode.",
          "A known failure on 2007 to 2013 models. A transmission shop replaces the 3-5-R wave plate.", "transmission_problem"),
        I("Power steering pump or line leaks", "Whining when turning, low power steering fluid.",
          "Fix leaks early so the pump doesn't run dry.", "power_steering_problem"),
    ],
    "gm_cobalt": [
        I("Ignition switch recall", "Engine shuts off while driving, power steering and airbags can turn off.",
          "Serious recall. Check your VIN at nhtsa.gov/recalls. Keep only the key on the ring until fixed.", "key_ignition_problem"),
        I("Electric power steering motor failure", "Steering suddenly gets heavy, power steering warning light.",
          "The steering motor was recalled on many. Check for open recalls.", "power_steering_problem"),
    ],
    "gm_14t": [
        I("Coolant leaks (1.4L turbo)", "Coolant smell, low coolant warnings, overheating.",
          "The water pump, thermostat housing and coolant hoses often leak. Fix them before the engine overheats.", "overheating"),
        I("PCV valve / valve cover failure", "Whistling or squealing at idle, oil leaks, lean codes.",
          "The PCV system is built into the valve cover, which gets replaced as one part.", "vacuum_leak"),
    ],
    "gm_northstar": [
        I("Northstar V8 head gasket failure", "Overheating, losing coolant, white smoke.",
          "An expensive repair because of how the head bolts are built. Get a second opinion on the cost.", "head_gasket_failure"),
        I("Northstar oil leaks", "Oil spots under the car, burning oil smell.",
          "The lower engine seals leak with age; a big labor job.", "oil_leak_low_oil"),
    ],
    "gm_passlock": [
        I("Passlock security no-start", "Cranks but won't start, or won't crank, security light flashing.",
          "The anti-theft system misreads the key. A shop can do a 10-minute relearn or replace the ignition sensor.", "key_ignition_problem"),
    ],
    "gm_colorado_0412": [
        I("Burnt exhaust valves (2.9/3.5/3.7L)", "Misfire on one cylinder, rough running, low compression.",
          "A compression test confirms it. The cylinder head needs a valve job.", "engine_misfire"),
    ],
    "gm_colorado_15up": [
        I("8-speed transmission shudder", "Shudder or harsh shifts at low speed.",
          "Ask a dealer about the transmission fluid update.", "torque_converter_shudder"),
    ],
    "gm_malibu_0412": [
        I("Steering column clunk", "Clicking or clunk in the steering wheel when turning.",
          "The intermediate steering shaft is replaced. Common and covered on some models.", "worn_suspension"),
        I("Power steering assist loss", "Steering suddenly gets very heavy, warning light on the dash.",
          "The electric power steering motor fails; check for recalls on your VIN.", "power_steering_problem"),
    ],
    "gm_equinox_0509": [
        I("Intake gasket coolant leak (3.4L V6)", "Coolant loss, sweet smell, overheating.",
          "Replace the intake gaskets before coolant reaches the oil.", "overheating"),
    ],
    "gm_vue_cvt": [
        I("CVT transmission failure (VTi)", "Slipping, whining, or the vehicle won't move.",
          "These CVTs often fail; repair cost can be more than the vehicle is worth. Get a quote first.", "cvt_problem"),
    ],
    "gm_inline5": [
        I("Burnt exhaust valves (inline-5)", "Misfire on one cylinder, rough running.",
          "A compression test confirms it; the head needs a valve job.", "engine_misfire"),
    ],
    # ------------------------------------------------------------------ Ford
    "ford_triton_2v": [
        I("Spark plug blowout (4.6/5.4/6.8L 2-valve)", "A loud pop, then a ticking/puffing sound and a misfire.",
          "The plug threads strip out of the head. A shop installs a thread insert; it's a known fix.", "engine_misfire"),
        I("Cracked plastic intake manifold (4.6/5.4L)", "Coolant leak at the front of the engine, overheating.",
          "The coolant crossover in the plastic intake cracks. Replace it with the updated aluminum-crossover part.", "overheating"),
    ],
    "ford_triton_3v": [
        I("Cam phaser / timing chain rattle (5.4L 3-valve)", "Ticking or rattle at idle and at startup, codes P0012/P0021 or P0016.",
          "Use the right oil and change it on time. Repair means phasers, chains and guides; a big job.", "timing_chain_problem"),
        I("Spark plugs break during removal (5.4L 3-valve)", "Misfires that need new plugs; shops quote extra time.",
          "Have a shop that knows these engines change the plugs with the special tool.", "engine_misfire"),
        I("Broken exhaust manifold studs", "Ticking from the engine, louder when cold.",
          "Studs break at the back of the manifold. Fix before the gasket burns out.", "exhaust_leak"),
    ],
    "ford_f150_9703": [
        I("4R70W/4R100 transmission wear", "Slipping, delayed shifts, flaring between gears.",
          "Check fluid; overdrive and 3-4 clutch wear is common.", "transmission_problem"),
    ],
    "ford_f150_0414": [
        I("Fuel pump driver module corrosion", "Stalls or won't start, especially after rain; fuel pump code.",
          "The module on the frame rusts. It's an inexpensive part with an updated mounting bracket.", "fuel_delivery_problem"),
        I("Heater blend door noise", "Clicking or tapping behind the dash.",
          "The blend door actuator fails; inexpensive part.", "blend_door_actuator"),
    ],
    "ford_ecoboost_35": [
        I("Timing chain stretch / cam phaser rattle (3.5L EcoBoost)", "Rattle for a few seconds at cold start, codes P0016 to P0019.",
          "Ford updated the parts. Fix it before the chain jumps. Change oil on time.", "timing_chain_problem"),
        I("Intercooler condensation stumble", "Stumbles or misfires when you accelerate hard in humid weather.",
          "Ford released an updated deflector or intercooler. Ask a dealer.", "engine_misfire"),
    ],
    "ford_iwe": [
        I("4x4 hub (IWE) grinding", "Grinding or clicking from the front wheels while driving in 2WD.",
          "A vacuum leak lets the front hubs partly engage. Fixing the vacuum line or check valve usually solves it.", "four_wheel_drive_problem"),
    ],
    "ford_10r80": [
        I("10-speed transmission harsh shifts", "Clunky, harsh or delayed shifts, especially 1st to 3rd.",
          "Ask the dealer about software updates and an adaptive relearn.", "transmission_problem"),
    ],
    "ford_50_coyote": [
        I("Oil burning (5.0L, some 2018 and newer)", "Oil level drops between changes.",
          "Check oil every fill-up and keep records; Ford has covered some under warranty.", "oil_burning"),
    ],
    "ford_27_ecoboost": [
        I("Leaking plastic oil pan (2.7L EcoBoost)", "Oil spots under the truck.",
          "The oil pan was updated; replace it and the gasket.", "oil_leak_low_oil"),
    ],
    "ford_60_powerstroke": [
        I("6.0L Power Stroke head gaskets and EGR cooler", "White smoke, losing coolant, coolant pushing out of the tank, overheating.",
          "A known weak spot (2003 to 2007). 'Bulletproofing' with head studs and new coolers is the long-term fix.", "head_gasket_failure"),
        I("Oil cooler clogging", "Engine runs hot, EGR cooler fails repeatedly.",
          "A shop compares oil and coolant temperatures to diagnose it. Use the right coolant and keep it clean.", "overheating"),
    ],
    "ford_64_powerstroke": [
        I("6.4L radiator and EGR cooler leaks", "Losing coolant, overheating, white smoke.",
          "Radiator leaks are very common; check the EGR cooler at the same time.", "overheating"),
    ],
    "ford_67_powerstroke": [
        I("CP4 fuel pump failure (6.7L, 2011 to 2019)", "Sudden stall or no start; metal in the fuel system.",
          "Use clean diesel and change fuel filters on time.", "fuel_delivery_problem"),
    ],
    "ford_death_wobble": [
        I("Front end 'death wobble'", "Violent shaking of the steering wheel after hitting a bump, usually at 45 to 60 mph.",
          "Slow down firmly to stop it. Worn track bar, steering damper, ball joints or tie rods; a front-end inspection finds it.", "death_wobble"),
    ],
    "ford_40_sohc": [
        I("Timing chain rattle (4.0L SOHC V6)", "Rattle at startup or around 2,000 to 3,000 rpm, check engine light.",
          "The timing chain guides and tensioners wear. Fix before it gets louder.", "timing_chain_problem"),
    ],
    "ford_5r55": [
        I("5R55 transmission failure", "Harsh shifts, slipping, no 2nd gear, or stuck in gear.",
          "The servo bore wears out. A transmission shop can install a fix kit.", "transmission_problem"),
    ],
    "ford_35_v6_wp": [
        I("Internal water pump failure (3.5/3.7L V6)", "Coolant loss, sweet smell, overheating, milky oil in bad cases.",
          "The pump is inside the engine, so a leak can mix coolant into the oil. Fix it at the first sign.", "water_pump_failure"),
        I("PTU (AWD) leaks", "Burning gear-oil smell, leaks near the transmission.",
          "The power transfer unit overheats its fluid. Change the fluid and fix leaks early.", "four_wheel_drive_problem"),
    ],
    "ford_explorer_1119": [
        I("Exhaust fumes in the cabin", "Exhaust smell inside, especially when accelerating with the A/C on.",
          "Ford released fixes (sealing the rear body). Check for recalls and service bulletins.", "exhaust_leak"),
    ],
    "ford_ecoboost_small": [
        I("Coolant leaking into cylinders (1.5/1.6L EcoBoost)", "Overheating, low coolant warning, white smoke, misfires.",
          "Stop driving if it overheats. Ford extended coverage on many; check with a dealer.", "head_gasket_failure"),
    ],
    "ford_powershift": [
        I("PowerShift automatic shudder (Focus/Fiesta)", "Shudder or jerking from a stop, hesitation, slipping, rattling.",
          "Ford extended the clutch warranty on many. A dealer can update software and replace the clutches.", "transmission_problem"),
    ],
    "ford_fusion_epas": [
        I("Power steering assist loss", "Steering gets heavy suddenly, power steering warning message.",
          "The electric steering was recalled on some years; check your VIN.", "power_steering_problem"),
    ],
    "ford_cd4e": [
        I("CD4E transmission failure", "Slipping, delayed engagement, no movement.",
          "Common on early Escapes; a transmission shop can rebuild it.", "transmission_problem"),
    ],
    "ford_panther": [
        I("Cracked plastic intake manifold (4.6L)", "Coolant leak at the front of the engine, overheating.",
          "Replace it with the updated part with the aluminum coolant crossover.", "overheating"),
        I("Blend door / heater control clicking", "Clicking behind the dash, heat stuck on one setting.",
          "The blend door actuator fails; inexpensive.", "blend_door_actuator"),
    ],
    "ford_air_susp": [
        I("Air suspension sagging", "Sits low on one corner or in the back after parking, suspension warning.",
          "Air springs and the compressor wear out. Some owners convert to regular coil springs.", "air_suspension_problem"),
    ],
    "ford_mt82": [
        I("Manual transmission (MT82) grinding", "Hard shifting or grinding into gears, especially when hot.",
          "Some fixes come from fluid changes and shifter bushings; check for updates.", "clutch_problem"),
    ],
    # --------------------------------------------------- Chrysler / Dodge / Jeep / Ram
    "fca_hemi_tick": [
        I("Hemi lifter and camshaft failure ('Hemi tick')", "Ticking that gets worse, misfire codes, rough idle.",
          "Get it checked early. A failed lifter roller damages the camshaft. Change oil on time.", "collapsed_lifter"),
    ],
    "fca_hemi_manifold": [
        I("Broken exhaust manifold bolts (5.7L Hemi)", "Ticking when cold that fades as it warms up.",
          "Replace the broken bolts and gasket; a common repair.", "exhaust_leak"),
    ],
    "fca_tipm": [
        I("TIPM fuse box failures", "Random no-starts, fuel pump not running, horn or wipers acting on their own.",
          "The power module under the hood fails. Some were recalled; a rebuilt unit is cheaper than new.", "electrical_ground_problem"),
    ],
    "fca_pentastar": [
        I("Oil filter housing / oil cooler leak (3.6L V6)", "Oil leak on top of the engine in the back, burning oil smell.",
          "The plastic housing cracks. Replace it with the updated (often aluminum) part.", "oil_leak_low_oil"),
        I("Rocker arm tick (early 3.6L, 2011 to 2013)", "Ticking from the top of the engine, misfire codes.",
          "Rocker arms and lifters are replaced; the left cylinder head was a known problem on early engines.", "collapsed_lifter"),
    ],
    "fca_47_v8": [
        I("4.7L V8 overheating and head gasket", "Running hot, losing coolant, white smoke.",
          "Keep the cooling system healthy; these engines don't tolerate overheating.", "head_gasket_failure"),
        I("Oil sludge (4.7L)", "Ticking, low oil pressure light.",
          "Change oil on time. Sludge comes from long oil intervals.", "oil_leak_low_oil"),
    ],
    "fca_27_v6": [
        I("2.7L V6 oil sludge and internal water pump", "Losing coolant, overheating, engine knocking or failure.",
          "Change oil often. The water pump is inside the engine; if it leaks, fix immediately.", "head_gasket_failure"),
    ],
    "fca_ram_lx_susp": [
        I("Front suspension clunk (control arm bushings)", "Clunk over bumps and when braking, uneven tire wear.",
          "Front control arms and tension struts wear out. Replace them and get an alignment.", "worn_suspension"),
    ],
    "fca_death_wobble": [
        I("Front end 'death wobble' (solid front axle)", "Violent steering shake after a bump at highway speed.",
          "Slow down firmly to stop it. Worn track bar, tie rods, ball joints or steering damper. A lift makes it more likely.", "death_wobble"),
    ],
    "fca_cummins_emissions": [
        I("Diesel emissions clogging (DPF/EGR)", "Loss of power, more regens, 'exhaust system service' message.",
          "Highway driving helps the filter clean itself. A shop can clean or replace the EGR and DPF.", "diesel_emissions_problem"),
    ],
    "jeep_40_rms": [
        I("Rear main seal oil leak (4.0L)", "Oil drips where the engine meets the transmission.",
          "Very common and usually slow. Check the level; fix during a clutch or transmission job.", "oil_leak_low_oil"),
    ],
    "jeep_37_v6": [
        I("3.7L V6 overheating and dropped valve seats", "Running hot, misfire, ticking.",
          "Keep the cooling system healthy; a misfire after overheating needs a compression test.", "overheating"),
    ],
    "fca_9speed": [
        I("9-speed transmission rough shifts", "Harsh, delayed or jerky shifts, hesitation from a stop.",
          "Software updates fixed many. Ask a dealer to check your VIN.", "transmission_problem"),
    ],
    "fca_24_tigershark": [
        I("Oil burning (2.4L Tigershark)", "Oil level drops between changes.",
          "Check the oil every fill-up. Some were covered by a warranty extension.", "oil_burning"),
    ],
    "fca_cvt": [
        I("CVT transmission failure", "Whining, slipping, shuddering, or loss of power.",
          "Change CVT fluid more often than the manual says. Check for warranty extensions.", "cvt_problem"),
    ],
    "fca_41te": [
        I("41TE / 62TE automatic transmission problems", "Harsh or slipping shifts, stuck in 2nd (limp mode).",
          "Check the fluid (it's a special type) and codes. A rebuild is common at high miles.", "transmission_problem"),
    ],
    "fca_neon": [
        I("Head gasket leak (2.0L)", "Losing coolant, overheating, white smoke.",
          "Fix before overheating warps the head.", "head_gasket_failure"),
    ],
    "fca_wk2": [
        I("TIPM fuel pump relay no-start (2011 to 2013)", "Cranks but won't start, or stalls.",
          "There was a recall. A dealer can install the external fuel pump relay fix.", "fuel_delivery_problem"),
        I("Air suspension problems (Quadra-Lift)", "Sits low, warning lights, compressor runs a lot.",
          "Air springs and the compressor wear out. Check for leaks.", "air_suspension_problem"),
    ],
    # ------------------------------------------------------------------ Toyota / Lexus / Scion
    "toyota_frame_rust": [
        I("Frame rust (some years were recalled)", "Rust holes or flaking on the frame, especially near the rear.",
          "Have the frame inspected yearly, especially in salty areas. Check your VIN for recalls and frame replacement.", "rust_damage"),
    ],
    "toyota_sai": [
        I("Secondary air injection pump failure", "Check engine light and limp mode after a cold start (P2440 to P2445).",
          "The air pump or valves fail, often from water. Covered by a warranty extension on many trucks.", None),
    ],
    "toyota_57_v8": [
        I("Cam tower / timing cover oil leaks (5.7L)", "Oil seeping at the back or front of the engine.",
          "Usually slow. Watch the oil level; fix at a bigger repair.", "oil_leak_low_oil"),
        I("Water pump leaks", "Coolant smell, pink crust at the front of the engine, low coolant.",
          "Replace the water pump before it fails completely.", "water_pump_failure"),
    ],
    "toyota_2az": [
        I("Oil burning (2.4L, about 2006 to 2011)", "Oil runs low between changes.",
          "Toyota extended coverage on many. Check oil every fill-up; piston rings are the fix.", "oil_burning"),
    ],
    "toyota_1zz": [
        I("Oil burning (1.8L, 1998 to 2002)", "Oil level drops; blue smoke at startup.",
          "Check oil often. Piston ring wear is the cause.", "oil_burning"),
    ],
    "toyota_2gr_hose": [
        I("Oil cooler line rubber hose leak (3.5L V6)", "Sudden oil leak at the front of the engine.",
          "Toyota replaced the rubber section with an all-metal line. Check that yours was updated.", "oil_leak_low_oil"),
    ],
    "toyota_1mz_sludge": [
        I("Oil sludge (3.0L V6, about 1997 to 2002)", "Ticking, oil light, blue smoke.",
          "Change oil often with good oil. Sludge damage is often found at an oil change.", "oil_leak_low_oil"),
    ],
    "toyota_dash": [
        I("Sticky or melting dashboard", "Dash surface gets sticky, shiny, or glare on the windshield.",
          "Lexus had a warranty program for some years; check with a dealer.", None),
    ],
    "toyota_tacoma_16up": [
        I("6-speed automatic shift hunting", "Shifts back and forth on hills, feels like it can't pick a gear.",
          "Toyota released software updates; ask a dealer.", "transmission_problem"),
        I("Rear differential seal leaks", "Gear oil on the rear axle or inside the rear wheels.",
          "Fix before the differential runs low on oil.", "differential_problem"),
    ],
    "toyota_tundra_22up": [
        I("Engine recall (3.4L twin turbo V6, 2022 to 2023)", "Knocking, loss of power, or engine failure.",
          "Check your VIN at nhtsa.gov/recalls; Toyota replaces affected engines.", None),
    ],
    "toyota_prius_3": [
        I("Head gasket / EGR cooler failure (2010 to 2015)", "Overheating, coolant loss, misfire, knocking at startup.",
          "Clean the EGR system at about 100k miles to help prevent it. Fix at the first sign of coolant loss.", "head_gasket_failure"),
    ],
    "toyota_hybrid_battery": [
        I("Hybrid battery wearing out", "Worse gas mileage, battery gauge swings fast, warning light.",
          "A hybrid shop can test it; rebuilt batteries cost much less than new.", "hybrid_ev_problem"),
    ],
    "toyota_corolla_0913": [
        I("Water pump leaks", "Coolant smell, pink crust near the pump, low coolant.",
          "Replace the water pump before it fails.", "water_pump_failure"),
    ],
    "toyota_rav4_19up": [
        I("Gas tank won't fill completely", "Pump clicks off early; range is lower than it should be.",
          "A known tank design issue on some years; ask a dealer about updates.", "evap_leak"),
    ],
    "lexus_carbon": [
        I("Carbon buildup (direct injection)", "Rough idle, misfires, hesitation.",
          "A shop can clean the intake valves (walnut blasting).", "engine_misfire"),
    ],
    # ------------------------------------------------------------------ Honda / Acura
    "honda_trans_9905": [
        I("Automatic transmission failure", "Slipping, flaring between 2nd and 3rd, transmission light flashing.",
          "A well-known weak spot on early 2000s Honda and Acura V6 models. Change fluid with genuine Honda fluid.", "transmission_problem"),
    ],
    "honda_vcm": [
        I("VCM (cylinder shutoff) misfires and oil burning", "Misfires, fouled spark plugs, shaking at low speed, oil use.",
          "Honda extended coverage on many. Some owners use a VCM disabler after repairs.", "engine_misfire"),
        I("Worn motor mounts (VCM)", "Vibration at idle or when the engine switches modes.",
          "The active engine mounts wear out; replace them.", "bad_motor_mounts"),
    ],
    "honda_timing_belt": [
        I("Timing belt due (3.5L V6)", "No symptom until it breaks, and then the engine stops and can be damaged.",
          "Replace the timing belt and water pump about every 100k miles or 7 years.", None),
    ],
    "honda_ac_compressor": [
        I("A/C compressor failure", "A/C blows warm, grinding or rattling from the compressor.",
          "When it fails it can spread metal through the A/C system, so the whole system gets flushed.", "ac_problem"),
    ],
    "honda_ac_condenser": [
        I("A/C condenser leaks", "A/C stops blowing cold.",
          "Honda extended coverage on some; check with a dealer.", "ac_problem"),
    ],
    "honda_vtc_rattle": [
        I("VTC actuator rattle at cold start (2.4L)", "A loud grinding rattle for a second or two at cold start.",
          "The cam timing (VTC) gear is replaced. Not urgent, but don't wait forever.", "timing_chain_problem"),
    ],
    "honda_civic_0609": [
        I("Cracked engine block (1.8L, 2006 to 2009)", "Coolant leak at the back of the engine, overheating.",
          "Honda extended the warranty on many. Check with a dealer.", "overheating"),
    ],
    "honda_15t_dilution": [
        I("Fuel in the oil (1.5L turbo)", "Oil smells like gas, oil level rising, especially in cold weather.",
          "Honda released software updates and extended coverage in cold states. Change oil on time.", "oil_leak_low_oil"),
    ],
    "honda_cvt_judder": [
        I("CVT judder", "A shudder or vibration when accelerating gently.",
          "Software updates and CVT fluid changes usually fix it.", "cvt_problem"),
    ],
    "honda_9speed": [
        I("9/10-speed transmission rough shifts", "Rough or delayed shifts, hesitation.",
          "Software updates help; ask a dealer.", "transmission_problem"),
    ],
    # ------------------------------------------------------------------ Nissan / Infiniti
    "nissan_cvt": [
        I("CVT transmission failure", "Whining, shuddering, slipping, loss of power, or limp mode.",
          "Nissan extended CVT warranties on many. Change CVT fluid about every 30k to 60k miles.", "cvt_problem"),
    ],
    "nissan_qr25_precat": [
        I("Pre-catalytic converter breaking apart (2.5L, 2002 to 2006)", "Rattle under the car, loss of power, oil burning, check engine light.",
          "Broken pieces can get sucked into the engine. Have it checked if it rattles.", "catalytic_converter_problem"),
        I("Crankshaft sensor stalling (recall)", "Stalls while driving or won't restart.",
          "There was a recall; check your VIN.", "fuel_delivery_problem"),
    ],
    "nissan_smod": [
        I("Radiator leaks coolant into the transmission ('strawberry milkshake')", "Shuddering, slipping, pink milky transmission fluid.",
          "Bypass the radiator's transmission cooler with an external cooler before it happens. Once mixed, the transmission is usually ruined.", "transmission_problem"),
    ],
    "nissan_vk56": [
        I("Cracked exhaust manifolds (5.6L V8)", "Ticking, especially when cold; exhaust smell.",
          "Replace the manifolds and gaskets.", "exhaust_leak"),
        I("Rear axle seal leaks", "Gear oil inside the rear wheels, brakes contaminated.",
          "Replace the axle seals and clean or replace the brake parts.", "differential_problem"),
    ],
    "nissan_ps_hose": [
        I("Power steering hose leaks", "Whining when turning, fluid on the ground.",
          "Replace the high-pressure hose.", "power_steering_problem"),
    ],
    "nissan_frontier_chain": [
        I("Timing chain guide whine (2.5L/4.0L)", "Whining that rises with RPM, codes P0335/P0340.",
          "Replace the timing chain guides early to avoid engine damage.", "timing_chain_problem"),
    ],
    "infiniti_vq_oil": [
        I("Oil burning (early 3.5L VQ)", "Oil level drops, especially if driven hard.",
          "Check oil often.", "oil_burning"),
    ],
    # ------------------------------------------------------------------ Hyundai / Kia
    "hk_theta2": [
        I("Theta II engine failure (2.0T / 2.4L)", "Knocking that gets louder with RPM, oil light, stalling, oil burning.",
          "Stop driving if it knocks. Hyundai/Kia recalled many and extended warranties; check your VIN.", "engine_knock"),
    ],
    "hk_nu_gamma": [
        I("Engine failure (1.6/1.8/2.0L Gamma/Nu)", "Knocking, oil burning, loss of power.",
          "Check your VIN for recalls and warranty extensions. Keep oil full.", "engine_knock"),
    ],
    "hk_steering_coupler": [
        I("Steering coupler clicking", "Clicking or knocking in the steering wheel when turning.",
          "The rubber coupler in the electric steering wears out; an inexpensive part.", "worn_suspension"),
    ],
    "hk_theft": [
        I("Easy to steal (key-start models, no immobilizer)", "Broken steering column, damaged ignition.",
          "Get the free anti-theft software update at a dealer and use a steering wheel lock.", "key_ignition_problem"),
    ],
    "hk_soul_cat": [
        I("Catalytic converter overheating damages pistons (1.6L, recall)", "Knocking, loss of power, check engine light.",
          "There was a recall with software and a warranty extension; check your VIN.", "catalytic_converter_problem"),
    ],
    # ------------------------------------------------------------------ Subaru
    "subaru_ej25": [
        I("Head gasket leaks (2.5L)", "Oil or coolant seeping at the sides of the engine, overheating, sweet smell.",
          "One of the most common Subaru repairs. Replace with updated multi-layer gaskets.", "head_gasket_failure"),
        I("Wheel bearing hum", "Humming that gets louder with speed.",
          "Wheel bearings wear on these; replace the noisy one.", "bad_wheel_bearing"),
    ],
    "subaru_fb_oil": [
        I("Oil burning (FB engines, about 2011 to 2015)", "Oil level drops between changes.",
          "Subaru extended coverage on many. Check oil every fill-up.", "oil_burning"),
    ],
    "subaru_cvt": [
        I("CVT judder or failure", "Shudder when accelerating, hesitation, whining.",
          "Subaru extended CVT warranties on many; ask a dealer about updates.", "cvt_problem"),
    ],
    "subaru_battery_drain": [
        I("Battery drains while parked (about 2015 to 2020)", "Dead battery after sitting a day or two.",
          "A known issue; a dealer can check for updates and test for parasitic draw.", "dead_battery"),
    ],
    # ------------------------------------------------------------------ VW / Audi
    "vw_mk4_coils": [
        I("Ignition coil failures (1.8T and VR6)", "Misfires, flashing check engine light, shaking.",
          "Replace the bad coil (and check plugs). Many were recalled.", "engine_misfire"),
        I("Oil sludge (1.8T)", "Oil light, turbo noise, burning oil.",
          "Use the right synthetic oil and change it on time.", "oil_leak_low_oil"),
    ],
    "vw_ea888_gen1": [
        I("Timing chain tensioner failure (2.0T, about 2008 to 2012)", "Rattle at startup; if it fails, the engine stops and is badly damaged.",
          "Replace the tensioner with the updated part as prevention. This one is worth doing before it fails.", "timing_chain_problem"),
        I("Oil burning (2.0T)", "Oil level drops between changes.",
          "Piston ring and PCV updates fix it; check oil often.", "oil_burning"),
    ],
    "vw_water_pump": [
        I("Plastic water pump / thermostat housing leaks", "Coolant smell, low coolant warning, pink crust at the pump.",
          "Replace the pump housing; very common on 2.0T and 1.8T engines.", "water_pump_failure"),
    ],
    "vw_carbon": [
        I("Carbon buildup on intake valves (direct injection)", "Rough idle, misfires, hesitation.",
          "Intake valve cleaning (walnut blasting) fixes it.", "engine_misfire"),
    ],
    "vw_dsg": [
        I("DSG automatic transmission problems", "Jerky low-speed shifts, flashing gear display, clunks.",
          "Change DSG fluid every 40k miles. The mechatronic unit is a common repair.", "transmission_problem"),
    ],
    "vw_tdi_hpfp": [
        I("Diesel fuel pump failure (TDI, 2009 to 2014)", "Stalls or won't start; metal in the fuel system.",
          "Expensive when it fails. Use clean diesel; never put gas in it.", "fuel_delivery_problem"),
    ],
    # ------------------------------------------------------------------ BMW / Mini
    "bmw_cooling": [
        I("Plastic cooling system failures", "Coolant leaks, overheating warning, sweet smell.",
          "Radiators, expansion tanks, and water pumps fail around 60k to 100k miles. Replace them as a set.", "overheating"),
        I("Oil filter housing and valve cover gasket leaks", "Burning oil smell, oil on the engine.",
          "Very common. Fix early; oil can ruin the drive belt and cause it to get sucked in.", "oil_leak_low_oil"),
    ],
    "bmw_n54": [
        I("High-pressure fuel pump failure (N54 twin turbo)", "Long crank, stuttering, limp mode.",
          "There was an extended warranty; check with a dealer.", "fuel_delivery_problem"),
    ],
    "bmw_n20": [
        I("Timing chain guide failure (N20 4-cylinder, 2012 to 2015)", "Whining that rises with RPM.",
          "Replace the chain and guides before it fails. BMW extended coverage on some.", "timing_chain_problem"),
    ],
    "mini_n14": [
        I("Timing chain rattle (2007 to 2013)", "Rattle at cold start.",
          "Replace the chain and tensioner before it jumps a tooth.", "timing_chain_problem"),
        I("Oil burning and carbon buildup", "Oil runs low, rough idle.",
          "Check oil often; clean the intake valves.", "oil_burning"),
    ],
    "mini_r50": [
        I("CVT failure (2002 to 2006 automatic)", "Slipping or won't move.",
          "These CVTs often fail; a manual transmission was much more reliable.", "cvt_problem"),
        I("Electric power steering pump failure", "Heavy steering, whining.",
          "The pump's cooling fan fails first; replacing it early can save the pump.", "power_steering_problem"),
    ],
    # ------------------------------------------------------------------ Mercedes
    "mb_m272": [
        I("Balance shaft / timing gear wear (V6, about 2005 to 2008)", "Check engine light with P0016/P0017.",
          "A big engine repair. Check service history before buying.", "timing_chain_problem"),
    ],
    "mb_airmatic": [
        I("Air suspension sagging (Airmatic)", "Sits low after parking, suspension warning.",
          "Air struts and the compressor wear out.", "air_suspension_problem"),
    ],
    "mb_trans_plate": [
        I("Transmission conductor plate failure", "Stuck in one gear (limp mode), harsh shifts.",
          "The electronic plate inside the transmission is replaced.", "transmission_problem"),
    ],
    "mb_sbc": [
        I("SBC brake system failure (2003 to 2006 E-Class)", "Brake warning messages, reduced braking power.",
          "Recalled and covered by extended warranty; check with a dealer.", "brake_fluid_leak"),
    ],
    # ------------------------------------------------------------------ Mazda / Mitsubishi / Volvo / others
    "mazda_cx7": [
        I("Turbo and timing chain problems (2.3L turbo)", "Loss of power, smoke, rattle at startup.",
          "Change oil often; these turbos and VVT parts need clean oil.", "turbo_problem"),
    ],
    "mazda_cx9_wp": [
        I("Internal water pump failure (3.7L V6)", "Losing coolant, overheating, coolant in the oil.",
          "The pump is inside the engine; fix at the first sign of coolant loss.", "water_pump_failure"),
    ],
    "mazda_rx8": [
        I("Rotary engine wear and flooding", "Hard starts, rough idle, low compression, oil burning by design.",
          "A rotary-specific compression test tells you engine health. Let it warm up before shutting off.", "engine_misfire"),
    ],
    "mazda3_0409": [
        I("Rust (rear wheel arches)", "Bubbling paint and rust around the rear wheels.",
          "Treat rust early.", "rust_damage"),
    ],
    "mitsu_cvt": [
        I("CVT problems", "Whining, shudder, hesitation.",
          "Change CVT fluid on schedule.", "cvt_problem"),
    ],
    "volvo_pcv": [
        I("Clogged PCV / oil trap", "Oil leaks, whistling from the engine, oil burning.",
          "Replace the PCV oil trap and hoses; common on older Volvos.", "vacuum_leak"),
    ],
    "volvo_xc90_trans": [
        I("Transmission failure (2003 to 2006 T6)", "Harsh shifts, slipping.",
          "A known weak transmission on early T6 models.", "transmission_problem"),
    ],
    "volvo_angle_gear": [
        I("AWD angle gear failure", "AWD warning, clunk or grinding from the front.",
          "Change its oil; it's often ignored.", "four_wheel_drive_problem"),
    ],
    "tesla_12v": [
        I("12-volt battery failure", "Car won't wake up or warnings to replace the 12V battery.",
          "The small 12V battery fails every few years; it's a quick replacement.", "dead_battery"),
    ],
    "tesla_susp": [
        I("Front suspension clunks (control arms)", "Clunk or creak over bumps.",
          "Front control arms wear; Tesla service can inspect.", "worn_suspension"),
    ],
    "tesla_heatpump": [
        I("Heat pump / A/C failures in cold weather", "No heat or A/C, warning to service the climate system.",
          "Software updates and parts replacements fixed many; check with Tesla service.", "ac_problem"),
    ],
    "lr_air": [
        I("Air suspension failure", "Sits low, suspension fault warning, compressor runs a lot.",
          "Air springs and the compressor wear out; a common repair on these.", "air_suspension_problem"),
    ],
    "lr_50_chain": [
        I("Timing chain guide wear (5.0L V8)", "Rattle at startup, P0016 codes.",
          "Replace the chains and guides before they fail.", "timing_chain_problem"),
    ],
    "pt_cruiser": [
        I("Worn motor mounts", "Clunk when accelerating or shifting, vibration.",
          "Replace the engine mounts.", "bad_motor_mounts"),
        I("Head gasket leak", "Losing coolant, overheating.",
          "Fix before the engine overheats.", "head_gasket_failure"),
    ],
}

# make, model, first year, last year, issue groups, other names people type
TRUCK_0007 = ["gm_truck_9907", "gm_ls_v8", "gm_4l60e"]
TRUCK_0713 = ["gm_truck_0714", "gm_ls_v8", "gm_afm"]
TRUCK_1418 = ["gm_truck_1418", "gm_afm"]
TRUCK_19UP = ["gm_truck_19up"]

MODELS = [
    # Chevrolet
    ("Chevrolet", "Silverado 1500", 1999, 2006, TRUCK_0007, ["silverado"]),
    ("Chevrolet", "Silverado 1500", 2007, 2013, TRUCK_0713, ["silverado"]),
    ("Chevrolet", "Silverado 1500", 2014, 2018, TRUCK_1418, ["silverado"]),
    ("Chevrolet", "Silverado 1500", 2019, 2026, TRUCK_19UP, ["silverado"]),
    ("Chevrolet", "Silverado 2500HD", 2001, 2007, ["gm_truck_9907", "gm_ls_v8", "gm_duramax_lb7"], ["silverado hd", "silverado 3500", "2500", "3500"]),
    ("Chevrolet", "Silverado 2500HD", 2008, 2014, ["gm_truck_0714", "gm_ls_v8", "gm_duramax_cp4"], ["silverado hd", "silverado 3500", "2500", "3500"]),
    ("Chevrolet", "Silverado 2500HD", 2015, 2019, ["gm_truck_1418", "gm_duramax_cp4"], ["silverado hd", "silverado 3500", "2500", "3500"]),
    ("Chevrolet", "Silverado 2500HD", 2020, 2026, ["gm_truck_19up"], ["silverado hd", "silverado 3500", "2500", "3500"]),
    ("Chevrolet", "Tahoe", 2000, 2006, TRUCK_0007, []),
    ("Chevrolet", "Tahoe", 2007, 2014, TRUCK_0713, []),
    ("Chevrolet", "Tahoe", 2015, 2020, TRUCK_1418, []),
    ("Chevrolet", "Tahoe", 2021, 2026, TRUCK_19UP, []),
    ("Chevrolet", "Suburban", 2000, 2006, TRUCK_0007, []),
    ("Chevrolet", "Suburban", 2007, 2014, TRUCK_0713, []),
    ("Chevrolet", "Suburban", 2015, 2020, TRUCK_1418, []),
    ("Chevrolet", "Suburban", 2021, 2026, TRUCK_19UP, []),
    ("Chevrolet", "Avalanche", 2002, 2006, TRUCK_0007, []),
    ("Chevrolet", "Avalanche", 2007, 2013, TRUCK_0713, []),
    ("Chevrolet", "Express", 2003, 2026, ["gm_ls_v8"], ["express van"]),
    ("Chevrolet", "Colorado", 2004, 2012, ["gm_colorado_0412"], []),
    ("Chevrolet", "Colorado", 2015, 2026, ["gm_colorado_15up"], []),
    ("Chevrolet", "Trailblazer", 2002, 2009, ["gm_trailblazer"], ["trail blazer"]),
    ("Chevrolet", "Equinox", 2005, 2009, ["gm_equinox_0509"], []),
    ("Chevrolet", "Equinox", 2010, 2017, ["gm_24_ecotec", "gm_36_v6"], []),
    ("Chevrolet", "Malibu", 2004, 2012, ["gm_malibu_0412", "gm_24_ecotec"], []),
    ("Chevrolet", "Impala", 2000, 2013, ["gm_34_38_v6", "gm_passlock"], []),
    ("Chevrolet", "Monte Carlo", 2000, 2007, ["gm_34_38_v6", "gm_passlock"], []),
    ("Chevrolet", "Cobalt", 2005, 2010, ["gm_cobalt"], []),
    ("Chevrolet", "HHR", 2006, 2011, ["gm_cobalt"], []),
    ("Chevrolet", "Cruze", 2011, 2019, ["gm_14t"], []),
    ("Chevrolet", "Sonic", 2012, 2020, ["gm_14t"], []),
    ("Chevrolet", "Trax", 2015, 2022, ["gm_14t"], []),
    ("Chevrolet", "Traverse", 2009, 2017, ["gm_lambda", "gm_36_v6"], []),
    ("Chevrolet", "Venture", 2000, 2005, ["gm_34_38_v6"], []),
    ("Chevrolet", "Camaro", 2010, 2015, ["gm_36_v6"], []),
    # GMC
    ("GMC", "Sierra 1500", 1999, 2006, TRUCK_0007, ["sierra"]),
    ("GMC", "Sierra 1500", 2007, 2013, TRUCK_0713, ["sierra"]),
    ("GMC", "Sierra 1500", 2014, 2018, TRUCK_1418, ["sierra"]),
    ("GMC", "Sierra 1500", 2019, 2026, TRUCK_19UP, ["sierra"]),
    ("GMC", "Sierra 2500HD", 2001, 2007, ["gm_truck_9907", "gm_ls_v8", "gm_duramax_lb7"], ["sierra hd", "sierra 3500", "2500", "3500"]),
    ("GMC", "Sierra 2500HD", 2008, 2014, ["gm_truck_0714", "gm_ls_v8", "gm_duramax_cp4"], ["sierra hd", "sierra 3500", "2500", "3500"]),
    ("GMC", "Sierra 2500HD", 2015, 2019, ["gm_truck_1418", "gm_duramax_cp4"], ["sierra hd", "sierra 3500", "2500", "3500"]),
    ("GMC", "Sierra 2500HD", 2020, 2026, ["gm_truck_19up"], ["sierra hd", "sierra 3500", "2500", "3500"]),
    ("GMC", "Yukon", 2000, 2006, TRUCK_0007, ["yukon xl", "denali"]),
    ("GMC", "Yukon", 2007, 2014, TRUCK_0713, ["yukon xl", "denali"]),
    ("GMC", "Yukon", 2015, 2020, TRUCK_1418, ["yukon xl", "denali"]),
    ("GMC", "Yukon", 2021, 2026, TRUCK_19UP, ["yukon xl", "denali"]),
    ("GMC", "Canyon", 2004, 2012, ["gm_colorado_0412"], []),
    ("GMC", "Canyon", 2015, 2026, ["gm_colorado_15up"], []),
    ("GMC", "Envoy", 2002, 2009, ["gm_trailblazer"], []),
    ("GMC", "Terrain", 2010, 2017, ["gm_24_ecotec", "gm_36_v6"], []),
    ("GMC", "Acadia", 2007, 2016, ["gm_lambda", "gm_36_v6"], []),
    ("GMC", "Savana", 2003, 2026, ["gm_ls_v8"], []),
    # Buick / Cadillac / Pontiac / Saturn / Hummer
    ("Buick", "LeSabre", 2000, 2005, ["gm_34_38_v6"], []),
    ("Buick", "Century", 2000, 2005, ["gm_34_38_v6"], []),
    ("Buick", "LaCrosse", 2005, 2009, ["gm_34_38_v6"], []),
    ("Buick", "Rendezvous", 2002, 2007, ["gm_34_38_v6"], []),
    ("Buick", "Enclave", 2008, 2017, ["gm_lambda", "gm_36_v6"], []),
    ("Buick", "Encore", 2013, 2022, ["gm_14t"], []),
    ("Cadillac", "Escalade", 2002, 2006, TRUCK_0007, ["escalade esv", "escalade ext"]),
    ("Cadillac", "Escalade", 2007, 2014, TRUCK_0713, ["escalade esv", "escalade ext"]),
    ("Cadillac", "Escalade", 2015, 2020, TRUCK_1418, ["escalade esv"]),
    ("Cadillac", "DeVille", 2000, 2005, ["gm_northstar"], ["dts"]),
    ("Cadillac", "STS", 2005, 2011, ["gm_northstar"], []),
    ("Cadillac", "CTS", 2008, 2014, ["gm_36_v6"], []),
    ("Cadillac", "SRX", 2010, 2016, ["gm_36_v6"], []),
    ("Pontiac", "Grand Prix", 2000, 2008, ["gm_34_38_v6", "gm_passlock"], []),
    ("Pontiac", "Grand Am", 2000, 2005, ["gm_34_38_v6", "gm_passlock"], []),
    ("Pontiac", "Montana", 2000, 2005, ["gm_34_38_v6"], []),
    ("Pontiac", "G5", 2007, 2010, ["gm_cobalt"], []),
    ("Pontiac", "G6", 2005, 2010, ["gm_malibu_0412"], []),
    ("Pontiac", "Vibe", 2003, 2010, ["toyota_1zz", "toyota_2az"], []),
    ("Saturn", "Ion", 2003, 2007, ["gm_cobalt"], []),
    ("Saturn", "Vue", 2002, 2007, ["gm_vue_cvt"], []),
    ("Saturn", "Outlook", 2007, 2010, ["gm_lambda", "gm_36_v6"], []),
    ("Hummer", "H2", 2003, 2009, TRUCK_0007, []),
    ("Hummer", "H3", 2006, 2010, ["gm_inline5"], []),
    # Ford
    ("Ford", "F-150", 1997, 2003, ["ford_triton_2v", "ford_f150_9703"], ["f150", "f 150"]),
    ("Ford", "F-150", 2004, 2008, ["ford_triton_3v", "ford_f150_0414"], ["f150", "f 150"]),
    ("Ford", "F-150", 2009, 2010, ["ford_triton_3v", "ford_f150_0414"], ["f150", "f 150"]),
    ("Ford", "F-150", 2011, 2014, ["ford_ecoboost_35", "ford_iwe", "ford_f150_0414"], ["f150", "f 150"]),
    ("Ford", "F-150", 2015, 2020, ["ford_ecoboost_35", "ford_iwe", "ford_10r80", "ford_50_coyote", "ford_27_ecoboost"], ["f150", "f 150"]),
    ("Ford", "F-150", 2021, 2026, ["ford_ecoboost_35", "ford_10r80", "ford_50_coyote"], ["f150", "f 150"]),
    ("Ford", "F-250 Super Duty", 1999, 2007, ["ford_60_powerstroke", "ford_triton_2v", "ford_death_wobble"], ["f250", "f 250", "f-350", "f350", "super duty"]),
    ("Ford", "F-250 Super Duty", 2008, 2010, ["ford_64_powerstroke", "ford_death_wobble"], ["f250", "f 250", "f-350", "f350", "super duty"]),
    ("Ford", "F-250 Super Duty", 2011, 2026, ["ford_67_powerstroke", "ford_death_wobble"], ["f250", "f 250", "f-350", "f350", "super duty"]),
    ("Ford", "Ranger", 1998, 2011, ["ford_40_sohc"], []),
    ("Ford", "Explorer", 2002, 2010, ["ford_40_sohc", "ford_5r55"], []),
    ("Ford", "Explorer", 2011, 2019, ["ford_35_v6_wp", "ford_explorer_1119"], []),
    ("Ford", "Explorer", 2020, 2026, ["ford_10r80"], []),
    ("Ford", "Expedition", 2003, 2014, ["ford_triton_3v", "ford_air_susp"], []),
    ("Ford", "Expedition", 2015, 2026, ["ford_ecoboost_35", "ford_10r80"], []),
    ("Ford", "Escape", 2001, 2007, ["ford_cd4e"], []),
    ("Ford", "Escape", 2013, 2019, ["ford_ecoboost_small"], []),
    ("Ford", "Edge", 2007, 2014, ["ford_35_v6_wp"], []),
    ("Ford", "Flex", 2009, 2019, ["ford_35_v6_wp"], []),
    ("Ford", "Taurus", 2010, 2019, ["ford_35_v6_wp"], []),
    ("Ford", "Fusion", 2013, 2020, ["ford_ecoboost_small", "ford_fusion_epas"], []),
    ("Ford", "Focus", 2012, 2018, ["ford_powershift"], []),
    ("Ford", "Fiesta", 2011, 2019, ["ford_powershift"], []),
    ("Ford", "Mustang", 2015, 2026, ["ford_mt82"], []),
    ("Ford", "Crown Victoria", 2000, 2011, ["ford_panther"], ["crown vic"]),
    ("Ford", "E-Series", 2000, 2014, ["ford_triton_2v"], ["e-150", "e150", "e-250", "e250", "e-350", "econoline"]),
    ("Lincoln", "Navigator", 2003, 2014, ["ford_triton_3v", "ford_air_susp"], []),
    ("Lincoln", "Navigator", 2018, 2026, ["ford_ecoboost_35", "ford_10r80"], []),
    ("Lincoln", "Town Car", 2000, 2011, ["ford_panther", "ford_air_susp"], []),
    ("Lincoln", "MKX", 2007, 2015, ["ford_35_v6_wp"], []),
    ("Lincoln", "MKZ", 2013, 2020, ["ford_fusion_epas"], []),
    ("Mercury", "Grand Marquis", 2000, 2011, ["ford_panther"], []),
    ("Mercury", "Mountaineer", 2002, 2010, ["ford_40_sohc", "ford_5r55"], []),
    ("Mercury", "Mariner", 2005, 2007, ["ford_cd4e"], []),
    ("Mazda", "B-Series", 1998, 2009, ["ford_40_sohc"], ["b3000", "b4000", "b2300"]),
    ("Mazda", "Tribute", 2001, 2006, ["ford_cd4e"], []),
    # Ram / Dodge / Chrysler / Jeep
    ("Ram", "1500", 2002, 2008, ["fca_hemi_manifold", "fca_47_v8", "fca_tipm"], ["ram 1500", "dodge ram"]),
    ("Ram", "1500", 2009, 2018, ["fca_hemi_tick", "fca_hemi_manifold", "fca_tipm", "fca_pentastar"], ["ram 1500", "dodge ram"]),
    ("Ram", "1500", 2019, 2026, ["fca_hemi_tick", "fca_hemi_manifold", "fca_pentastar"], ["ram 1500"]),
    ("Ram", "2500", 2003, 2026, ["fca_death_wobble", "fca_cummins_emissions", "fca_hemi_manifold"], ["ram 2500", "ram 3500", "3500", "dodge ram 2500", "cummins"]),
    ("Dodge", "Dakota", 2000, 2011, ["fca_47_v8"], []),
    ("Dodge", "Durango", 2004, 2009, ["fca_hemi_manifold", "fca_47_v8", "fca_tipm"], []),
    ("Dodge", "Durango", 2011, 2026, ["fca_pentastar", "fca_hemi_tick", "fca_tipm"], []),
    ("Dodge", "Charger", 2006, 2010, ["fca_27_v6", "fca_hemi_tick", "fca_ram_lx_susp", "fca_tipm"], []),
    ("Dodge", "Charger", 2011, 2023, ["fca_pentastar", "fca_hemi_tick", "fca_ram_lx_susp"], []),
    ("Dodge", "Challenger", 2008, 2023, ["fca_pentastar", "fca_hemi_tick", "fca_ram_lx_susp"], []),
    ("Dodge", "Magnum", 2005, 2008, ["fca_27_v6", "fca_hemi_tick", "fca_ram_lx_susp"], []),
    ("Dodge", "Grand Caravan", 2001, 2007, ["fca_41te"], ["caravan"]),
    ("Dodge", "Grand Caravan", 2008, 2020, ["fca_41te", "fca_pentastar", "fca_tipm"], ["caravan"]),
    ("Dodge", "Journey", 2009, 2020, ["fca_pentastar", "fca_tipm"], []),
    ("Dodge", "Avenger", 2008, 2014, ["fca_27_v6", "fca_pentastar"], []),
    ("Dodge", "Caliber", 2007, 2012, ["fca_cvt"], []),
    ("Dodge", "Neon", 2000, 2005, ["fca_neon"], []),
    ("Dodge", "Nitro", 2007, 2011, ["jeep_37_v6"], []),
    ("Chrysler", "300", 2005, 2010, ["fca_27_v6", "fca_hemi_tick", "fca_ram_lx_susp", "fca_tipm"], []),
    ("Chrysler", "300", 2011, 2023, ["fca_pentastar", "fca_hemi_tick", "fca_ram_lx_susp"], []),
    ("Chrysler", "Town & Country", 2001, 2007, ["fca_41te"], ["town and country"]),
    ("Chrysler", "Town & Country", 2008, 2016, ["fca_41te", "fca_pentastar", "fca_tipm"], ["town and country"]),
    ("Chrysler", "Pacifica", 2017, 2026, ["fca_9speed", "fca_pentastar"], []),
    ("Chrysler", "Sebring", 2001, 2010, ["fca_27_v6"], []),
    ("Chrysler", "200", 2011, 2017, ["fca_pentastar", "fca_9speed", "fca_24_tigershark"], []),
    ("Chrysler", "PT Cruiser", 2001, 2010, ["pt_cruiser"], []),
    ("Jeep", "Wrangler", 1997, 2006, ["jeep_40_rms", "fca_death_wobble"], ["tj"]),
    ("Jeep", "Wrangler", 2007, 2018, ["fca_death_wobble", "fca_pentastar", "fca_tipm"], ["jk", "wrangler unlimited"]),
    ("Jeep", "Wrangler", 2018, 2026, ["fca_death_wobble", "fca_pentastar"], ["jl", "wrangler unlimited"]),
    ("Jeep", "Gladiator", 2020, 2026, ["fca_death_wobble", "fca_pentastar"], []),
    ("Jeep", "Grand Cherokee", 1999, 2004, ["fca_47_v8", "jeep_40_rms"], ["wj"]),
    ("Jeep", "Grand Cherokee", 2005, 2010, ["fca_hemi_manifold", "fca_47_v8", "fca_tipm"], ["wk"]),
    ("Jeep", "Grand Cherokee", 2011, 2021, ["fca_pentastar", "fca_hemi_tick", "fca_wk2"], ["wk2"]),
    ("Jeep", "Liberty", 2002, 2012, ["jeep_37_v6"], []),
    ("Jeep", "Cherokee", 2014, 2023, ["fca_9speed", "fca_24_tigershark"], []),
    ("Jeep", "Compass", 2007, 2017, ["fca_cvt"], []),
    ("Jeep", "Patriot", 2007, 2017, ["fca_cvt"], []),
    ("Jeep", "Renegade", 2015, 2023, ["fca_9speed", "fca_24_tigershark"], []),
    # Toyota / Lexus / Scion
    ("Toyota", "Tacoma", 2000, 2004, ["toyota_frame_rust"], []),
    ("Toyota", "Tacoma", 2005, 2015, ["toyota_frame_rust"], []),
    ("Toyota", "Tacoma", 2016, 2023, ["toyota_tacoma_16up"], []),
    ("Toyota", "Tundra", 2000, 2006, ["toyota_frame_rust"], []),
    ("Toyota", "Tundra", 2007, 2021, ["toyota_57_v8", "toyota_sai"], []),
    ("Toyota", "Tundra", 2022, 2026, ["toyota_tundra_22up"], []),
    ("Toyota", "Sequoia", 2001, 2004, ["toyota_frame_rust"], []),
    ("Toyota", "Sequoia", 2008, 2022, ["toyota_57_v8", "toyota_sai"], []),
        ("Toyota", "Camry", 2000, 2001, ["toyota_1mz_sludge"], []),
        ("Toyota", "Camry", 2007, 2011, ["toyota_2az", "toyota_2gr_hose"], []),
    ("Toyota", "Corolla", 2000, 2002, ["toyota_1zz"], []),
    ("Toyota", "Corolla", 2009, 2013, ["toyota_corolla_0913"], []),
    ("Toyota", "Matrix", 2003, 2013, ["toyota_1zz", "toyota_2az"], []),
    ("Toyota", "RAV4", 2006, 2012, ["toyota_2az", "toyota_2gr_hose"], ["rav 4"]),
    ("Toyota", "RAV4", 2019, 2026, ["toyota_rav4_19up"], ["rav 4"]),
    ("Toyota", "Highlander", 2001, 2003, ["toyota_1mz_sludge"], []),
    ("Toyota", "Highlander", 2008, 2013, ["toyota_2gr_hose", "toyota_2az"], []),
    ("Toyota", "Sienna", 2000, 2003, ["toyota_1mz_sludge"], []),
    ("Toyota", "Sienna", 2004, 2010, ["toyota_2gr_hose"], []),
    ("Toyota", "Avalon", 2005, 2012, ["toyota_2gr_hose"], []),
    ("Toyota", "Solara", 2002, 2008, ["toyota_2az", "toyota_1mz_sludge"], []),
    ("Toyota", "Prius", 2004, 2009, ["toyota_hybrid_battery"], []),
    ("Toyota", "Prius", 2010, 2015, ["toyota_prius_3", "toyota_hybrid_battery"], []),
    ("Lexus", "RX", 2000, 2003, ["toyota_1mz_sludge"], ["rx300", "rx 300"]),
    ("Lexus", "RX", 2007, 2015, ["toyota_2gr_hose"], ["rx350", "rx 350"]),
    ("Lexus", "ES", 2000, 2003, ["toyota_1mz_sludge"], ["es300"]),
    ("Lexus", "ES", 2007, 2012, ["toyota_2gr_hose", "toyota_dash"], ["es350"]),
    ("Lexus", "IS", 2006, 2013, ["lexus_carbon"], ["is250", "is 250", "is350"]),
    ("Scion", "tC", 2005, 2010, ["toyota_2az"], []),
    ("Scion", "xB", 2008, 2015, ["toyota_2az"], []),
    # Honda / Acura
    ("Honda", "Accord", 1998, 2004, ["honda_trans_9905"], []),
    ("Honda", "Accord", 2003, 2004, ["honda_trans_9905"], []),
    ("Honda", "Accord", 2008, 2012, ["honda_vcm", "honda_timing_belt"], []),
    ("Honda", "Accord", 2018, 2022, ["honda_15t_dilution"], []),
    ("Honda", "Civic", 2001, 2005, ["honda_trans_9905"], []),
    ("Honda", "Civic", 2006, 2011, ["honda_civic_0609"], []),
    ("Honda", "Civic", 2016, 2021, ["honda_ac_condenser", "honda_15t_dilution"], []),
    ("Honda", "CR-V", 2002, 2006, ["honda_ac_compressor"], ["crv", "cr v"]),
    ("Honda", "CR-V", 2007, 2016, ["honda_vtc_rattle", "honda_ac_compressor"], ["crv", "cr v"]),
    ("Honda", "CR-V", 2015, 2016, ["honda_cvt_judder"], ["crv", "cr v"]),
    ("Honda", "CR-V", 2017, 2022, ["honda_15t_dilution"], ["crv", "cr v"]),
    ("Honda", "Element", 2003, 2011, ["honda_vtc_rattle", "honda_ac_compressor"], []),
    ("Honda", "Odyssey", 1999, 2004, ["honda_trans_9905", "honda_timing_belt"], []),
    ("Honda", "Odyssey", 2005, 2017, ["honda_vcm", "honda_timing_belt"], []),
    ("Honda", "Odyssey", 2018, 2026, ["honda_9speed", "honda_timing_belt"], []),
    ("Honda", "Pilot", 2003, 2004, ["honda_trans_9905", "honda_timing_belt"], []),
    ("Honda", "Pilot", 2006, 2015, ["honda_vcm", "honda_timing_belt"], []),
    ("Honda", "Pilot", 2016, 2022, ["honda_9speed", "honda_vcm", "honda_timing_belt"], []),
    ("Honda", "Ridgeline", 2006, 2014, ["honda_timing_belt"], []),
    ("Honda", "Ridgeline", 2017, 2026, ["honda_vcm", "honda_timing_belt"], []),
    ("Acura", "TL", 1999, 2003, ["honda_trans_9905", "honda_timing_belt"], []),
    ("Acura", "CL", 2001, 2003, ["honda_trans_9905", "honda_timing_belt"], []),
    ("Acura", "MDX", 2001, 2006, ["honda_trans_9905", "honda_timing_belt"], []),
    ("Acura", "MDX", 2014, 2020, ["honda_vcm", "honda_timing_belt", "honda_9speed"], []),
    ("Acura", "RDX", 2013, 2018, ["honda_vcm", "honda_timing_belt"], []),
    ("Acura", "TSX", 2004, 2014, ["honda_vtc_rattle"], []),
    # Nissan / Infiniti
    ("Nissan", "Altima", 2002, 2006, ["nissan_qr25_precat"], []),
    ("Nissan", "Altima", 2007, 2026, ["nissan_cvt"], []),
    ("Nissan", "Sentra", 2007, 2026, ["nissan_cvt"], []),
    ("Nissan", "Sentra", 2002, 2006, ["nissan_qr25_precat"], []),
    ("Nissan", "Rogue", 2008, 2026, ["nissan_cvt"], []),
    ("Nissan", "Versa", 2007, 2026, ["nissan_cvt"], []),
    ("Nissan", "Maxima", 2009, 2023, ["nissan_cvt"], []),
    ("Nissan", "Murano", 2003, 2026, ["nissan_cvt", "nissan_ps_hose"], []),
    ("Nissan", "Pathfinder", 2005, 2010, ["nissan_smod"], []),
    ("Nissan", "Pathfinder", 2013, 2020, ["nissan_cvt"], []),
    ("Nissan", "Xterra", 2005, 2010, ["nissan_smod", "nissan_frontier_chain"], []),
    ("Nissan", "Frontier", 2005, 2010, ["nissan_smod", "nissan_frontier_chain"], []),
    ("Nissan", "Titan", 2004, 2015, ["nissan_vk56"], []),
    ("Nissan", "Armada", 2004, 2015, ["nissan_vk56"], []),
    ("Nissan", "Quest", 2004, 2017, ["nissan_cvt"], []),
    ("Nissan", "Juke", 2011, 2017, ["nissan_cvt"], []),
    ("Infiniti", "G35", 2003, 2008, ["infiniti_vq_oil"], []),
    ("Infiniti", "FX35", 2003, 2008, ["infiniti_vq_oil"], ["fx"]),
    ("Infiniti", "QX56", 2004, 2010, ["nissan_vk56"], []),
    ("Infiniti", "QX60", 2013, 2020, ["nissan_cvt"], ["jx35"]),
    # Hyundai / Kia
    ("Hyundai", "Sonata", 2011, 2019, ["hk_theta2", "hk_steering_coupler", "hk_theft"], []),
    ("Hyundai", "Santa Fe", 2013, 2018, ["hk_theta2", "hk_theft"], ["santa fe sport"]),
        ("Hyundai", "Tucson", 2010, 2021, ["hk_theta2", "hk_theft"], []),
    ("Hyundai", "Elantra", 2011, 2020, ["hk_nu_gamma", "hk_steering_coupler", "hk_theft"], []),
    ("Hyundai", "Accent", 2012, 2022, ["hk_nu_gamma", "hk_theft"], []),
    ("Hyundai", "Veloster", 2012, 2017, ["hk_nu_gamma", "hk_theft"], []),
    ("Kia", "Optima", 2011, 2020, ["hk_theta2", "hk_theft"], ["k5"]),
    ("Kia", "Sorento", 2011, 2020, ["hk_theta2", "hk_theft"], []),
    ("Kia", "Sportage", 2011, 2022, ["hk_theta2", "hk_theft"], []),
    ("Kia", "Soul", 2012, 2019, ["hk_soul_cat", "hk_nu_gamma", "hk_theft"], []),
    ("Kia", "Forte", 2010, 2018, ["hk_nu_gamma", "hk_theft"], []),
    ("Kia", "Rio", 2012, 2021, ["hk_nu_gamma", "hk_theft"], []),
    # Subaru
    ("Subaru", "Outback", 2000, 2012, ["subaru_ej25"], []),
    ("Subaru", "Outback", 2013, 2014, ["subaru_fb_oil", "subaru_cvt"], []),
    ("Subaru", "Outback", 2015, 2019, ["subaru_cvt", "subaru_battery_drain"], []),
    ("Subaru", "Legacy", 2000, 2012, ["subaru_ej25"], []),
    ("Subaru", "Legacy", 2015, 2019, ["subaru_cvt", "subaru_battery_drain"], []),
    ("Subaru", "Forester", 2000, 2010, ["subaru_ej25"], []),
    ("Subaru", "Forester", 2011, 2018, ["subaru_fb_oil", "subaru_cvt"], []),
    ("Subaru", "Impreza", 2000, 2011, ["subaru_ej25"], ["wrx"]),
    ("Subaru", "Impreza", 2012, 2016, ["subaru_fb_oil", "subaru_cvt"], []),
    ("Subaru", "Crosstrek", 2013, 2017, ["subaru_fb_oil", "subaru_cvt"], ["xv crosstrek"]),
    ("Subaru", "Ascent", 2019, 2026, ["subaru_cvt"], []),
    # Volkswagen / Audi
    ("Volkswagen", "Jetta", 1999, 2005, ["vw_mk4_coils"], []),
    ("Volkswagen", "Jetta", 2006, 2026, ["vw_ea888_gen1", "vw_water_pump", "vw_carbon", "vw_dsg", "vw_tdi_hpfp"], []),
    ("Volkswagen", "Golf", 1999, 2005, ["vw_mk4_coils"], ["gti"]),
    ("Volkswagen", "Golf", 2006, 2026, ["vw_ea888_gen1", "vw_water_pump", "vw_carbon", "vw_dsg"], ["gti"]),
    ("Volkswagen", "Beetle", 1998, 2010, ["vw_mk4_coils"], ["new beetle"]),
    ("Volkswagen", "Passat", 2001, 2005, ["vw_mk4_coils"], []),
    ("Volkswagen", "Passat", 2006, 2022, ["vw_ea888_gen1", "vw_water_pump", "vw_carbon", "vw_dsg"], []),
    ("Volkswagen", "Tiguan", 2009, 2026, ["vw_ea888_gen1", "vw_water_pump", "vw_carbon"], []),
    ("Volkswagen", "Atlas", 2018, 2026, ["vw_water_pump"], []),
    ("Audi", "A4", 2002, 2008, ["vw_mk4_coils"], []),
    ("Audi", "A4", 2009, 2016, ["vw_ea888_gen1", "vw_water_pump", "vw_carbon"], []),
    ("Audi", "Q5", 2009, 2017, ["vw_ea888_gen1", "vw_water_pump", "vw_carbon"], []),
    # BMW / Mini / Mercedes
    ("BMW", "3 Series", 1999, 2011, ["bmw_cooling", "bmw_n54"], ["325i", "328i", "330i", "335i", "e46", "e90"]),
    ("BMW", "3 Series", 2012, 2019, ["bmw_cooling", "bmw_n20"], ["328i", "320i", "f30"]),
    ("BMW", "5 Series", 2004, 2010, ["bmw_cooling", "bmw_n54"], ["528i", "535i", "e60"]),
    ("BMW", "5 Series", 2011, 2016, ["bmw_cooling", "bmw_n20"], ["528i", "f10"]),
    ("BMW", "X3", 2004, 2017, ["bmw_cooling", "bmw_n20"], []),
    ("BMW", "X5", 2000, 2018, ["bmw_cooling"], []),
    ("Mini", "Cooper", 2002, 2006, ["mini_r50"], ["cooper s"]),
    ("Mini", "Cooper", 2007, 2013, ["mini_n14"], ["cooper s", "countryman"]),
    ("Mercedes-Benz", "C-Class", 2005, 2007, ["mb_m272", "mb_trans_plate"], ["c230", "c280", "c350"]),
    ("Mercedes-Benz", "E-Class", 2003, 2009, ["mb_sbc", "mb_airmatic", "mb_m272", "mb_trans_plate"], ["e320", "e350", "e500"]),
    ("Mercedes-Benz", "ML-Class", 2006, 2011, ["mb_m272", "mb_airmatic", "mb_trans_plate"], ["ml350", "m-class", "ml"]),
    ("Mercedes-Benz", "GL-Class", 2007, 2012, ["mb_airmatic", "mb_trans_plate"], ["gl450", "gl"]),
    # Mazda / Mitsubishi / Volvo / Tesla / Land Rover
    ("Mazda", "Mazda3", 2004, 2009, ["mazda3_0409"], ["3", "mazda 3"]),
    ("Mazda", "CX-7", 2007, 2012, ["mazda_cx7"], ["cx7"]),
    ("Mazda", "CX-9", 2007, 2015, ["mazda_cx9_wp"], ["cx9"]),
    ("Mazda", "RX-8", 2004, 2011, ["mazda_rx8"], ["rx8"]),
    ("Mitsubishi", "Outlander", 2007, 2026, ["mitsu_cvt"], []),
    ("Mitsubishi", "Lancer", 2008, 2017, ["mitsu_cvt"], []),
    ("Volvo", "XC90", 2003, 2014, ["volvo_xc90_trans", "volvo_pcv", "volvo_angle_gear"], []),
    ("Volvo", "S60", 2001, 2009, ["volvo_pcv", "volvo_angle_gear"], []),
    ("Volvo", "V70", 2001, 2007, ["volvo_pcv", "volvo_angle_gear"], ["xc70"]),
    ("Tesla", "Model 3", 2017, 2026, ["tesla_12v", "tesla_heatpump"], []),
    ("Tesla", "Model Y", 2020, 2026, ["tesla_12v", "tesla_heatpump"], []),
    ("Tesla", "Model S", 2012, 2026, ["tesla_12v", "tesla_susp"], []),
    ("Tesla", "Model X", 2016, 2026, ["tesla_12v", "tesla_susp"], []),
    ("Land Rover", "Range Rover Sport", 2006, 2013, ["lr_air", "lr_50_chain"], []),
    ("Land Rover", "LR3", 2005, 2009, ["lr_air"], []),
    ("Land Rover", "LR4", 2010, 2016, ["lr_air", "lr_50_chain"], []),
    ("Land Rover", "Range Rover", 2003, 2012, ["lr_air", "lr_50_chain"], []),
]

# Common US models from 2000 on, for the make/model pickers. Models that
# aren't in MODELS above simply have no known-problem list yet.
MODEL_NAMES = {
    # Makes only in the dataset get their model names from it.
    "Alfa Romeo": [], "Isuzu": [], "Oldsmobile": [], "Plymouth": [], "Porsche": [], "Rivian": [], "Saab": [], "Suzuki": [],
    "Acura": ["CL", "ILX", "Integra", "MDX", "RDX", "RL", "RSX", "TL", "TLX", "TSX", "ZDX"],
    "Audi": ["A3", "A4", "A5", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "TT", "e-tron"],
    "BMW": ["3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X6", "Z4", "i3"],
    "Buick": ["Century", "Enclave", "Encore", "Envision", "LaCrosse", "LeSabre", "Lucerne", "Park Avenue", "Regal", "Rendezvous", "Rainier", "Terraza", "Verano"],
    "Cadillac": ["ATS", "CT4", "CT5", "CTS", "DeVille", "DTS", "Escalade", "SRX", "STS", "XT4", "XT5", "XT6", "XTS"],
    "Chevrolet": ["Avalanche", "Aveo", "Blazer", "Bolt", "Camaro", "Cobalt", "Colorado", "Corvette", "Cruze", "Equinox", "Express", "HHR", "Impala", "Malibu", "Monte Carlo", "S-10", "Silverado 1500", "Silverado 2500HD", "Silverado 3500HD", "Sonic", "Spark", "Suburban", "Tahoe", "Tracker", "Trailblazer", "Traverse", "Trax", "Uplander", "Venture", "Volt"],
    "Chrysler": ["200", "300", "Aspen", "Concorde", "Crossfire", "Pacifica", "PT Cruiser", "Sebring", "Town & Country", "Voyager"],
    "Dodge": ["Avenger", "Caliber", "Challenger", "Charger", "Dakota", "Dart", "Durango", "Grand Caravan", "Hornet", "Intrepid", "Journey", "Magnum", "Neon", "Nitro", "Stratus", "Viper"],
    "Fiat": ["500", "500X"],
    "Ford": ["Bronco", "Bronco Sport", "Crown Victoria", "E-Series", "EcoSport", "Edge", "Escape", "Excursion", "Expedition", "Explorer", "Explorer Sport Trac", "F-150", "F-250 Super Duty", "F-350 Super Duty", "Fiesta", "Five Hundred", "Flex", "Focus", "Freestar", "Fusion", "Maverick", "Mustang", "Mustang Mach-E", "Ranger", "Taurus", "Transit", "Transit Connect"],
    "Genesis": ["G70", "G80", "G90", "GV70", "GV80"],
    "GMC": ["Acadia", "Canyon", "Envoy", "Savana", "Sierra 1500", "Sierra 2500HD", "Sierra 3500HD", "Sonoma", "Terrain", "Yukon"],
    "Honda": ["Accord", "Civic", "CR-V", "CR-Z", "Element", "Fit", "HR-V", "Insight", "Odyssey", "Passport", "Pilot", "Ridgeline"],
    "Hummer": ["H2", "H3"],
    "Hyundai": ["Accent", "Azera", "Elantra", "Genesis", "Ioniq", "Kona", "Palisade", "Santa Cruz", "Santa Fe", "Sonata", "Tucson", "Veloster", "Venue"],
    "Infiniti": ["FX35", "G35", "G37", "Q50", "Q60", "QX50", "QX56", "QX60", "QX80"],
    "Jeep": ["Cherokee", "Commander", "Compass", "Gladiator", "Grand Cherokee", "Liberty", "Patriot", "Renegade", "Wagoneer", "Wrangler"],
    "Kia": ["Carnival", "Forte", "K5", "Niro", "Optima", "Rio", "Sedona", "Seltos", "Sorento", "Soul", "Sportage", "Stinger", "Telluride"],
    "Land Rover": ["Defender", "Discovery", "Discovery Sport", "LR2", "LR3", "LR4", "Range Rover", "Range Rover Evoque", "Range Rover Sport"],
    "Lexus": ["ES", "GS", "GX", "IS", "LS", "LX", "NX", "RX", "UX"],
    "Lincoln": ["Aviator", "Continental", "LS", "MKC", "MKS", "MKX", "MKZ", "Nautilus", "Navigator", "Town Car"],
    "Mazda": ["B-Series", "CX-3", "CX-30", "CX-5", "CX-50", "CX-7", "CX-9", "CX-90", "Mazda3", "Mazda5", "Mazda6", "MX-5 Miata", "MPV", "Protege", "RX-8", "Tribute"],
    "Mercedes-Benz": ["C-Class", "CLA", "E-Class", "GL-Class", "GLA", "GLC", "GLE", "GLS", "ML-Class", "S-Class", "Sprinter"],
    "Mercury": ["Grand Marquis", "Mariner", "Milan", "Montego", "Mountaineer", "Sable"],
    "Mini": ["Cooper", "Countryman", "Clubman"],
    "Mitsubishi": ["Eclipse", "Eclipse Cross", "Endeavor", "Galant", "Lancer", "Mirage", "Outlander", "Outlander Sport"],
    "Nissan": ["350Z", "370Z", "Altima", "Armada", "Frontier", "Juke", "Kicks", "Leaf", "Maxima", "Murano", "Pathfinder", "Quest", "Rogue", "Sentra", "Titan", "Versa", "Xterra"],
    "Pontiac": ["Aztek", "Bonneville", "G5", "G6", "G8", "Grand Am", "Grand Prix", "Montana", "Solstice", "Sunfire", "Torrent", "Vibe"],
    "Ram": ["1500", "2500", "3500", "ProMaster"],
    "Saturn": ["Aura", "Ion", "L-Series", "Outlook", "Relay", "S-Series", "Sky", "Vue"],
    "Scion": ["FR-S", "iA", "iM", "tC", "xA", "xB", "xD"],
    "Subaru": ["Ascent", "BRZ", "Crosstrek", "Forester", "Impreza", "Legacy", "Outback", "Tribeca", "WRX"],
    "Tesla": ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y"],
    "Toyota": ["4Runner", "86", "Avalon", "C-HR", "Camry", "Corolla", "Corolla Cross", "Echo", "FJ Cruiser", "Highlander", "Land Cruiser", "Matrix", "Prius", "RAV4", "Sequoia", "Sienna", "Solara", "Tacoma", "Tundra", "Venza", "Yaris"],
    "Volkswagen": ["Atlas", "Beetle", "CC", "Eos", "Golf", "Jetta", "Passat", "Routan", "Taos", "Tiguan", "Touareg"],
    "Volvo": ["S40", "S60", "S80", "S90", "V70", "XC40", "XC60", "XC70", "XC90"],
}

# Problems that only happen with a certain engine. If the owner typed an
# engine in their profile and it doesn't contain any of these, the problem
# is hidden. (No engine typed = show everything.)
ENGINE_TAGS = {
    "gm_ls_v8": ["4.8", "5.3", "6.0", "6.2", "v8", "ls"], "gm_afm": ["5.3", "6.2", "v8"],
    "gm_duramax_lb7": ["duramax", "diesel", "6.6", "lb7"], "gm_duramax_cp4": ["duramax", "diesel", "6.6", "lml"],
    "gm_34_38_v6": ["3.1", "3.4", "3.8", "v6"], "gm_24_ecotec": ["2.4"], "gm_36_v6": ["3.0", "3.6", "v6"],
    "gm_14t": ["1.4"], "gm_northstar": ["4.6", "northstar", "v8"], "gm_equinox_0509": ["3.4", "v6"],
    "gm_colorado_0412": ["2.9", "3.5", "3.7"], "gm_inline5": ["3.5", "3.7"],
    "ford_triton_2v": ["4.6", "5.4", "6.8", "triton", "v8", "v10"], "ford_triton_3v": ["5.4", "triton", "3v", "v8"],
    "ford_ecoboost_35": ["3.5", "ecoboost"], "ford_50_coyote": ["5.0", "coyote"], "ford_27_ecoboost": ["2.7"],
    "ford_60_powerstroke": ["6.0", "powerstroke", "power stroke", "diesel"],
    "ford_64_powerstroke": ["6.4", "powerstroke", "power stroke", "diesel"],
    "ford_67_powerstroke": ["6.7", "powerstroke", "power stroke", "diesel"],
    "ford_40_sohc": ["4.0", "v6"], "ford_35_v6_wp": ["3.5", "3.7", "v6"], "ford_ecoboost_small": ["1.5", "1.6", "ecoboost"],
    "ford_panther": ["4.6", "v8"],
    "fca_hemi_tick": ["5.7", "6.4", "hemi", "v8"], "fca_hemi_manifold": ["5.7", "hemi", "v8"],
    "fca_pentastar": ["3.6", "pentastar", "v6"], "fca_47_v8": ["4.7", "v8"], "fca_27_v6": ["2.7", "v6"],
    "fca_cummins_emissions": ["cummins", "diesel", "6.7"], "jeep_40_rms": ["4.0"], "jeep_37_v6": ["3.7", "v6"],
    "fca_24_tigershark": ["2.4"], "fca_neon": ["2.0"],
    "toyota_2az": ["2.4"], "toyota_1zz": ["1.8"], "toyota_2gr_hose": ["3.5", "v6"], "toyota_1mz_sludge": ["3.0", "v6"],
    "toyota_57_v8": ["5.7", "v8"], "toyota_sai": ["5.7", "4.7", "v8"],
    "honda_vcm": ["3.5", "v6"], "honda_timing_belt": ["3.0", "3.2", "3.5", "3.7", "v6"], "honda_vtc_rattle": ["2.4"],
    "honda_15t_dilution": ["1.5"], "honda_civic_0609": ["1.8"],
    "nissan_qr25_precat": ["2.5"], "nissan_vk56": ["5.6", "v8"], "nissan_frontier_chain": ["2.5", "4.0"],
    "infiniti_vq_oil": ["3.5", "v6"], "hk_theta2": ["2.0", "2.4"], "hk_soul_cat": ["1.6"],
    "subaru_ej25": ["2.5"], "subaru_fb_oil": ["2.0", "2.5"],
    "vw_mk4_coils": ["1.8", "vr6", "2.8"], "vw_ea888_gen1": ["2.0", "1.8", "tsi"], "vw_water_pump": ["2.0", "1.8", "tsi"],
    "vw_carbon": ["2.0", "1.8", "tsi", "fsi"], "vw_tdi_hpfp": ["tdi", "diesel"],
    "bmw_n54": ["n54", "335", "535", "3.0"], "bmw_n20": ["n20", "2.0", "28i"],
    "mb_m272": ["3.0", "3.5", "v6"], "mazda_cx7": ["2.3"], "mazda_cx9_wp": ["3.7"], "lr_50_chain": ["5.0"],
}

# What people type -> official make name
MAKE_ALIASES = {
    "chevy": "Chevrolet", "vw": "Volkswagen", "mercedes": "Mercedes-Benz", "benz": "Mercedes-Benz",
    "mb": "Mercedes-Benz", "dodge ram": "Ram", "land rover": "Land Rover", "range rover": "Land Rover",
    "gm": "Chevrolet", "caddy": "Cadillac",
}


# ---------------------------------------------------------------------------
# The US vehicle dataset (data/us_vehicles.json)
# ---------------------------------------------------------------------------

def norm(text):
    return "".join(ch for ch in text.lower() if ch.isalnum())


# Dataset names that need help becoming the names people type.
NAME_FIXES = {
    ("Chevrolet", "Silverado 2500HD/3500"): ("Chevrolet", ["Silverado 2500HD", "Silverado 3500HD", "Silverado 2500", "Silverado 3500"]),
    ("GMC", "Sierra 2500HD/3500"): ("GMC", ["Sierra 2500HD", "Sierra 3500HD", "Sierra 2500", "Sierra 3500"]),
    ("Ram", "2500/3500"): ("Ram", ["2500", "3500"]),
    ("Dodge", "Ram 1500"): ("Ram", ["1500"]),  # the app treats "Dodge Ram" as Ram
    ("Dodge", "Ram 2500/3500"): ("Ram", ["2500", "3500"]),
    ("Ford", "F-250/F-350 Super Duty"): ("Ford", ["F-250 Super Duty", "F-350 Super Duty", "F-250", "F-350"]),
    ("Chevrolet", "Blazer (S-10)"): ("Chevrolet", ["Blazer", "S-10 Blazer"]),
    ("Chevrolet", "Bolt EV / EUV"): ("Chevrolet", ["Bolt EV", "Bolt EUV", "Bolt"]),
}


def dataset_names(make, model):
    """"Yukon / Yukon XL" -> ("GMC", ["Yukon", "Yukon XL"])."""
    if (make, model) in NAME_FIXES:
        return NAME_FIXES[(make, model)]
    return make, [part.strip() for part in model.split(" / ") if part.strip()]


# Words in a problem title that tie it to certain engines, and the words
# that mark those engines in the dataset's engine list.
ENGINE_WORDS = {
    "ecoboost": ["ecoboost"], "hemi": ["hemi"], "coyote": ["coyote", "5.0"],
    "duramax": ["duramax"], "power stroke": ["power stroke"], "powerstroke": ["power stroke"],
    "cummins": ["cummins"], "ecodiesel": ["ecodiesel"], "tdi": ["tdi"],
    "diesel": ["diesel", "duramax", "cummins", "power stroke", "tdi", "ecodiesel", "crd"],
    "hybrid": ["hybrid", "phev", "prime", "energi"], "turbo": ["turbo", "ecoboost", "tt"],
    "v6": ["v6"], "v8": ["v8"], "v10": ["v10"], "i5": ["i5"],
    "2az": ["2.4"], "1zz": ["1zz", "1.8"], "2zz": ["2zz"], "2gr": ["3.5"], "2zr": ["1.8"], "1mz": ["3.0"],
    "qr25": ["2.5"], "vq": ["3.5"], "ej25": ["2.5"], "fb25": ["2.5"], "fb20": ["2.0"], "fa20": ["2.0"],
    "n20": ["n20", "2.0"], "n54": ["n54"], "n55": ["n55"], "n63": ["4.4"], "m272": ["v6", "3.0", "3.5"],
    "lb7": ["lb7"], "lly": ["lly"], "lmm": ["lmm"], "lml": ["lml"], "l5p": ["l5p"], "l87": ["6.2"],
    "ls1": ["ls1"], "ls7": ["ls7"], "3v": ["3v"], "1.8t": ["1.8"], "2.0t": ["2.0"], "1.5t": ["1.5"],
    "1.6t": ["1.6"], "2.5t": ["2.5"], "1.4t": ["1.4"], "smartstream": ["2.0"], "theta": ["2.0", "2.4"],
    "gdi": ["gdi", "1.6", "2.0", "2.4"], "nu": ["1.8", "2.0"],
}
DISPLACEMENT = re.compile(r"(?<![\d.])(\d\.\d)(?![\d])")


def engine_tags(title, engines):
    """Which of a generation's engines a problem applies to.

    Returns (tags, label): tags are the normalized words the app looks for in
    the engine the owner typed; label is shown to people ("5.4L V8 3V").
    ([], "") means the problem applies to every engine.
    """
    lower = title.lower()
    words = set(DISPLACEMENT.findall(lower))
    for word in ENGINE_WORDS:
        if re.search(r"(?<![a-z0-9.])" + re.escape(word) + r"(?![a-z0-9])", lower):
            words.add(word)
    # "2.5T" means the 2.5 turbo, not every 2.5.
    turbo_sizes = {w for w in words if w.endswith("t") and DISPLACEMENT.fullmatch(w[:-1])}
    words -= {w[:-1] for w in turbo_sizes}
    if not words or not engines:
        return [], ""

    def hits(engine, word):
        e = engine.lower()
        if word in turbo_sizes:
            return word[:-1] in e and any(t in e for t in ("turbo", "tsi", "ecoboost", "tt"))
        keys = ENGINE_WORDS.get(word, [word])
        return any(k in e for k in keys)

    matched = [e for e in engines if any(hits(e, w) for w in words)]
    # Displacements are the most specific clue: if any number in the title
    # matches an engine, only keep engines that match a number.
    numbers = [w for w in words if DISPLACEMENT.fullmatch(w)]
    if numbers and any(hits(e, n) for e in engines for n in numbers):
        matched = [e for e in matched if any(hits(e, n) for n in numbers)]
    if not matched or len(matched) == len(engines):
        return [], ""
    tags = set()
    for engine in matched:
        e = engine.lower()
        for num in DISPLACEMENT.findall(e):
            # Only use the number if no unaffected engine shares it.
            if not any(num in other for other in engines if other not in matched):
                tags.add(norm(num))
        for word in words:
            for key in ENGINE_WORDS.get(word, [word]):
                if key in e and not DISPLACEMENT.fullmatch(key):
                    tags.add(norm(key))
    if turbo_sizes:
        tags.add("turbo")
    tags.discard("")
    if not tags:
        return [], ""
    return sorted(tags), ", ".join(matched)


# How ENGINE_TAGS words are shown to people ("Only on: 5.4L Triton 3V V8").
WORD_LABELS = {"v6": "V6", "v8": "V8", "v10": "V10", "ls": "LS", "lb7": "LB7", "lml": "LML", "3v": "3V",
               "tdi": "TDI", "tsi": "TSI", "fsi": "FSI", "vr6": "VR6", "n54": "N54", "n20": "N20",
               "ecoboost": "EcoBoost", "hemi": "Hemi", "duramax": "Duramax", "cummins": "Cummins",
               "triton": "Triton", "coyote": "Coyote", "northstar": "Northstar", "pentastar": "Pentastar",
               "diesel": "diesel", "powerstroke": "Power Stroke", "power stroke": "Power Stroke"}


def engine_label(tags):
    sizes = [t for t in tags if DISPLACEMENT.fullmatch(t)]
    words = []
    for t in tags:
        label = WORD_LABELS.get(t)
        if label and label not in words:
            words.append(label)
    return " ".join(filter(None, ["/".join(sizes) + "L" if sizes else "", *words]))


def significant_words(title):
    skip = {"failure", "issues", "issue", "leaks", "leak", "problems", "wear", "faults", "about", "early"}
    return {w for w in re.findall(r"[a-z]{4,}", title.lower()) if w not in skip}


def dataset_rows(curated_models):
    """Turn every dataset generation into a vehicles.json row and group.

    A problem is skipped when a curated MODELS row for the same vehicle
    already covers it (same kind of problem, or same cause and shared words),
    so the hand-checked text wins and nothing shows twice.
    """
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    curated_by_key = {}
    for make, model, start, end, groups, aka in curated_models:
        for name in [model, *aka]:
            curated_by_key.setdefault((make, norm(name)), []).append((start, end, groups))
    groups, rows, unmatched = {}, [], []
    for v in data["vehicles"]:
        make, names = dataset_names(v["make"], v["model"])
        start, end = v["year_start"], v["year_end"] or LAST_YEAR
        start = max(start, 1984)
        covered = []  # curated issues for this exact vehicle and all its years
        for (c_make, key), ranges in curated_by_key.items():
            # "Yukon XL" is covered by a curated "Yukon" row too.
            if c_make != make or not any(norm(n).startswith(key) for n in names):
                continue
            for c_start, c_end, c_groups in ranges:
                if c_start <= max(start, 2000) and c_end >= end:
                    covered += [i for g in c_groups for i in ISSUES[g]]
        covered_kinds = {(classify(i["t"]) or {}).get("kind") for i in covered}
        issues = []
        for title in v["common_problems"]:
            rule = classify(title)
            if rule is None:
                unmatched.append(title)
                continue
            if rule["kind"] in covered_kinds or any(
                    i["c"] is not None and i["c"] == rule["c"] and significant_words(i["t"]) & significant_words(title)
                    for i in covered):
                continue
            issue = {"t": title, "k": rule["kind"]}
            todo = with_recall(rule, title)
            if todo != rule["w"]:
                issue["w"] = todo
            tags, label = engine_tags(title, v["engines"])
            if tags:
                issue["e"], issue["en"] = tags, label
            issues.append(issue)
        group = "v:" + v["id"]
        groups[group] = issues
        rows.append({"make": make, "model": names[0], "from": start, "to": end, "groups": [group],
                     "aka": [n.lower() for n in names[1:]], "gen": v["generation"], "eng": v["engines"]})
    assert not unmatched, f"add rules in problem_rules.py for: {sorted(set(unmatched))}"
    kinds = {r["kind"]: {"s": r["s"], "w": r["w"], "c": r["c"]} for r in RULES}
    return groups, rows, kinds


def main():
    causes = json.loads((ROOT / "app" / "causes.json").read_text(encoding="utf-8"))
    for name, issues in ISSUES.items():
        for issue in issues:
            assert issue["c"] is None or issue["c"] in causes, f"{name}: unknown cause {issue['c']}"
    for row in MODELS:
        for group in row[4]:
            assert group in ISSUES, f"{row[:2]}: unknown group {group}"
    for rule in RULES:
        assert rule["c"] is None or rule["c"] in causes, f"problem_rules {rule['kind']}: unknown cause {rule['c']}"
    for group, tags in ENGINE_TAGS.items():
        assert group in ISSUES, f"ENGINE_TAGS: unknown group {group}"
        for issue in ISSUES[group]:
            issue["e"] = [norm(t) for t in tags]
            issue["en"] = engine_label(tags)
    ds_groups, ds_rows, kinds = dataset_rows(MODELS)
    for row in MODELS + [(r["make"],) for r in ds_rows]:
        assert row[0] in MODEL_NAMES, f"add {row[0]} to MODEL_NAMES"
    names = {make: set(models) for make, models in MODEL_NAMES.items()}
    for m in MODELS:
        names[m[0]].add(m[1])
    for r in ds_rows:
        # Picker shows the first name; alternates (aka) only if not a bare number.
        names[r["make"]].add(r["model"])
    data = {
        "note": "Commonly reported problems. Not every vehicle will have them.",
        "aliases": MAKE_ALIASES,
        "names": {make: sorted(n, key=str.lower) for make, n in sorted(names.items())},
        "kinds": kinds,
        "groups": {**ISSUES, **ds_groups},
        # Curated rows first so their hand-written text shows first.
        "models": [{"make": m, "model": mo, "from": a, "to": b, "groups": g, "aka": aka}
                   for m, mo, a, b, g, aka in MODELS] + ds_rows,
    }
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    vehicles = {(r["make"], r["model"]) for r in data["models"] if any(data["groups"][g] for g in r["groups"])}
    count = sum(len(v) for v in data["groups"].values())
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(names)} makes, {sum(len(n) for n in names.values())} models to pick from, "
          f"{len(vehicles)} with known-problem lists ({len(data['models'])} year ranges, "
          f"{len(ds_rows)} generations from the dataset), {count} known problems "
          f"({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
