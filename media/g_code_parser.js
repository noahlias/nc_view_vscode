const MACRO_EXPR_ALLOWED = /^[0-9+\-*/().\s]+$/;
const MIN_ARC_SEGMENTS = 12;
const MAX_ARC_SEGMENTS = 2048;
const MAX_ARC_SEGMENT_LENGTH = 0.75; // roughly 0.75 units per chord
const MAX_ARC_SEGMENT_ANGLE = (5 * Math.PI) / 180; // 5 degrees

function computeArcSegments(radius, sweep, baseSegments = 64) {
  const absRadius = Math.abs(radius);
  const absSweep = Math.abs(sweep);
  if (!Number.isFinite(absRadius) || !Number.isFinite(absSweep) || absRadius === 0) {
    return baseSegments;
  }

  const arcLength = absSweep * absRadius;
  const segmentsByLength = arcLength / MAX_ARC_SEGMENT_LENGTH;
  const segmentsByAngle = absSweep / MAX_ARC_SEGMENT_ANGLE;
  const desired = Math.max(baseSegments, segmentsByLength, segmentsByAngle);
  return Math.min(MAX_ARC_SEGMENTS, Math.max(MIN_ARC_SEGMENTS, Math.ceil(desired)));
}

function evaluateMacroExpression(expr, rParameters) {
  if (!expr) return 0;
  const substituted = expr.replace(/R(\d+)/gi, (_, idx) => {
    const value = rParameters[idx];
    return Number.isFinite(value) ? value : 0;
  });

  if (!MACRO_EXPR_ALLOWED.test(substituted)) {
    const fallback = Number(substituted);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${substituted});`)();
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    console.warn("Failed to evaluate macro expression", expr, error);
    return 0;
  }
}

function tryProcessRParamAssignment(line, rParameters, macroEnabled) {
  if (!macroEnabled) return false;
  const assignmentMatch = line.match(/^R(\d+)\s*=\s*(.+)$/i);
  if (!assignmentMatch) return false;

  const [, index, rawExpr] = assignmentMatch;
  const expression = rawExpr.replace(/;.*/, "").trim();
  if (!expression) {
    rParameters[index] = 0;
    return true;
  }

  const value = evaluateMacroExpression(expression, rParameters);
  rParameters[index] = Number.isFinite(value) ? value : 0;
  return true;
}

const NUMERIC_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MACRO_DIRECTIVE = /^\s*;\s*@MACRO\s+(BEGIN|END)\b/i;

function extractParametersFromLine(line, rParameters, macroEnabled) {
  const params = {};
  let idx = 0;

  const isLetter = (char) => char >= "A" && char <= "Z";

  while (idx < line.length) {
    const char = line[idx];
    if (!isLetter(char)) {
      idx += 1;
      continue;
    }

    const letter = char;
    idx += 1;

    if (line[idx] === "=") {
      idx += 1;
    }

    let buffer = "";
    const allowMacroLetters = Boolean(line[idx - 1] === "=");

    while (idx < line.length) {
      const current = line[idx];

      if (isLetter(current)) {
        const next = line[idx + 1] ?? "";
        const looksLikeMacroRef =
          allowMacroLetters &&
          current === "R" &&
          (next >= "0" || next === "(" || next === "+" || next === "-");

        if (!looksLikeMacroRef) {
          break;
        }
      }

      buffer += current;
      idx += 1;
    }

    const rawValue = buffer.trim();
    if (!rawValue) {
      continue;
    }

    let numericValue;
    if (!macroEnabled) {
      numericValue = NUMERIC_LITERAL.test(rawValue) ? Number(rawValue) : NaN;
    } else {
      numericValue = evaluateMacroExpression(rawValue, rParameters);
    }
    if (!Number.isFinite(numericValue)) {
      continue;
    }

    if (!params[letter]) {
      params[letter] = [];
    }
    params[letter].push(numericValue);
  }

  return params;
}

function chooseArcCenterFromRadius(
  startA,
  startB,
  endA,
  endB,
  radiusValue,
  command,
) {
  const radius = Math.abs(radiusValue);
  const dx = endA - startA;
  const dy = endB - startB;
  const chord2 = dx * dx + dy * dy;

  if (!Number.isFinite(radius) || radius === 0 || chord2 === 0) {
    return null;
  }

  const chord = Math.sqrt(chord2);
  const halfChord = chord / 2;
  if (halfChord > radius) {
    return null;
  }

  const mx = (startA + endA) / 2;
  const my = (startB + endB) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const h = Math.sqrt(Math.max(0, radius * radius - halfChord * halfChord));

  const centers = [
    { A: mx + h * nx, B: my + h * ny },
    { A: mx - h * nx, B: my - h * ny },
  ];

  const sweepFor = (center) => {
    const startAngle = Math.atan2(startB - center.B, startA - center.A);
    const endAngle = Math.atan2(endB - center.B, endA - center.A);
    let sweep = endAngle - startAngle;
    if (command === "G2" && sweep > 0) sweep -= 2 * Math.PI;
    if (command === "G3" && sweep < 0) sweep += 2 * Math.PI;
    return sweep;
  };

  const candidates = centers.map((center) => ({
    center,
    sweep: sweepFor(center),
  }));

  const preferMajor = radiusValue < 0;
  const preferredSign = command === "G2" ? -1 : 1;
  const matching = candidates.filter(
    (item) => Math.sign(item.sweep || preferredSign) === preferredSign,
  );
  const usable = matching.length > 0 ? matching : candidates;

  const sorted = usable.sort((a, b) => Math.abs(a.sweep) - Math.abs(b.sweep));
  const chosen = preferMajor ? sorted[sorted.length - 1] : sorted[0];

  if (!chosen) return null;
  return chosen;
}

function parseGCode(
  gcode,
  segmentCount = 64,
  excludeCodes = ["G10", "G90", "G53", "G30"],
) {
  const lines = gcode.split("\n");
  const movements = [];
  const rParameters = {};

  let currentPosition = { X: 0, Y: 0, Z: 0 };
  let currentCommand = "G0";
  let currentFeedrate = null;
  let centerMode = null;
  let motionMode = "absolute";
  let plane = "G17";
  let macroDepth = 0;

  const FULL_CIRCLE_TOLERANCE = 1e-6;
  const firstArcDetected = { used: false };

  const addMove = (command, x, y, z, feedrate, lineNumber) => {
    movements.push({ command, X: x, Y: y, Z: z, feedrate, lineNumber });
  };

  addMove(
    currentCommand,
    currentPosition.X,
    currentPosition.Y,
    currentPosition.Z,
    currentFeedrate,
    0,
  );

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line === "") continue;

    const macroDirective = line.match(MACRO_DIRECTIVE);
    if (macroDirective) {
      if (macroDirective[1].toUpperCase() === "BEGIN") {
        macroDepth += 1;
      } else {
        macroDepth = Math.max(0, macroDepth - 1);
      }
      continue;
    }

    if (line.startsWith(";") || line.startsWith("(") || line.startsWith("%")) continue;

    line = line.replace(/;.*$/, "").trim();
    if (line === "") continue;

    const upperLine = line.toUpperCase();
    const macroEnabled = macroDepth > 0;

    if (tryProcessRParamAssignment(upperLine, rParameters, macroEnabled)) {
      continue;
    }

    if (
      excludeCodes.some((code) =>
        upperLine.match(new RegExp(`\\b${code}(\\s|$)`, "i")),
      )
    ) {
      continue;
    }

    const params = extractParametersFromLine(upperLine, rParameters, macroEnabled);

    const gCodes = params["G"] || [];
    for (const g of gCodes) {
      if (g === 90.1) centerMode = "absolute";
      else if (g === 91.1) centerMode = "relative";
      else if (g === 90) motionMode = "absolute";
      else if (g === 91) motionMode = "incremental";
      else if ([0, 1, 2, 3].includes(g)) currentCommand = `G${g}`;
      else if ([17, 18, 19].includes(g)) plane = `G${g}`;
    }

    if (params["F"]) currentFeedrate = params["F"][0];

    const x = params["X"]?.[0];
    const y = params["Y"]?.[0];
    const z = params["Z"]?.[0];
    const iVal = params["I"]?.[0] ?? 0;
    const jVal = params["J"]?.[0] ?? 0;
    const kVal = params["K"]?.[0] ?? 0;
    const rVal = params["R"]?.[0];

    if (currentCommand === "G2" || currentCommand === "G3") {
      const target = { ...currentPosition };
      if (x !== undefined)
        target.X = motionMode === "absolute" ? x : currentPosition.X + x;
      if (y !== undefined)
        target.Y = motionMode === "absolute" ? y : currentPosition.Y + y;
      if (z !== undefined)
        target.Z = motionMode === "absolute" ? z : currentPosition.Z + z;

      let axisA = "X",
        axisB = "Y",
        iKey = "I",
        jKey = "J";
      if (plane === "G18") {
        axisA = "Z";
        axisB = "X";
        iKey = "K";
        jKey = "I";
      } else if (plane === "G19") {
        axisA = "Y";
        axisB = "Z";
        iKey = "J";
        jKey = "K";
      }

      const startA = currentPosition[axisA];
      const startB = currentPosition[axisB];
      const endA = target[axisA];
      const endB = target[axisB];

      let centerA, centerB;
      let sweepOverride = null;

      if (rVal !== undefined) {
        const resolved = chooseArcCenterFromRadius(
          startA,
          startB,
          endA,
          endB,
          rVal,
          currentCommand,
        );

        if (!resolved) {
          addMove("G1", target.X, target.Y, target.Z, currentFeedrate, i);
          currentPosition = { ...target };
          continue;
        }

        centerA = resolved.center.A;
        centerB = resolved.center.B;
        sweepOverride = resolved.sweep;
      } else {
        const relCenter = {
          A:
            currentPosition[axisA] +
            (iKey === "I" ? iVal : jKey === "I" ? iVal : kVal),
          B:
            currentPosition[axisB] +
            (jKey === "J" ? jVal : iKey === "J" ? jVal : kVal),
        };
        const absCenter = {
          A: iKey === "I" ? iVal : jKey === "I" ? iVal : kVal,
          B: jKey === "J" ? jVal : iKey === "J" ? jVal : kVal,
        };

        if (!centerMode && !firstArcDetected.used) {
          const distRel = Math.abs(
            Math.hypot(startA - relCenter.A, startB - relCenter.B) -
            Math.hypot(endA - relCenter.A, endB - relCenter.B),
          );
          const distAbs = Math.abs(
            Math.hypot(startA - absCenter.A, startB - absCenter.B) -
            Math.hypot(endA - absCenter.A, endB - absCenter.B),
          );
          centerMode = distRel <= distAbs ? "relative" : "absolute";
          firstArcDetected.used = true;
        }

        const chosen = centerMode === "relative" ? relCenter : absCenter;
        centerA = chosen.A;
        centerB = chosen.B;
      }

      const startAngle = Math.atan2(startB - centerB, startA - centerA);
      let endAngle = Math.atan2(endB - centerB, endA - centerA);
      const radius = Math.hypot(startA - centerA, startB - centerB);

      let sweep = sweepOverride ?? endAngle - startAngle;
      const isFullCircle =
        Math.hypot(endA - startA, endB - startB) < FULL_CIRCLE_TOLERANCE;

      if (!sweepOverride) {
        if (isFullCircle) {
          sweep = currentCommand === "G2" ? -2 * Math.PI : 2 * Math.PI;
        } else {
          if (currentCommand === "G2" && sweep > 0) sweep -= 2 * Math.PI;
          if (currentCommand === "G3" && sweep < 0) sweep += 2 * Math.PI;
        }
      }

      const orthogonalAxis =
        plane === "G17" ? "Z" : plane === "G18" ? "Y" : "X";
      const dOrthogonal =
        target[orthogonalAxis] - currentPosition[orthogonalAxis];

      const arcSegments = computeArcSegments(radius, sweep, segmentCount);

      for (let j = 1; j <= arcSegments; j++) {
        const angle = startAngle + (sweep * j) / arcSegments;
        const ratio = j / arcSegments;
        const point = { ...currentPosition };

        point[axisA] = centerA + radius * Math.cos(angle);
        point[axisB] = centerB + radius * Math.sin(angle);
        point[orthogonalAxis] =
          currentPosition[orthogonalAxis] + ratio * dOrthogonal;

        if (
          !Number.isNaN(point.X) &&
          !Number.isNaN(point.Y) &&
          !Number.isNaN(point.Z)
        ) {
          addMove("G1", point.X, point.Y, point.Z, currentFeedrate, i);
        }
      }

      currentPosition = { ...target };
    } else if (
      x !== undefined ||
      y !== undefined ||
      z !== undefined ||
      gCodes.length > 0
    ) {
      const pos = { ...currentPosition };
      if (x !== undefined)
        pos.X = motionMode === "absolute" ? x : currentPosition.X + x;
      if (y !== undefined)
        pos.Y = motionMode === "absolute" ? y : currentPosition.Y + y;
      if (z !== undefined)
        pos.Z = motionMode === "absolute" ? z : currentPosition.Z + z;

      if (
        !Number.isNaN(pos.X) &&
        !Number.isNaN(pos.Y) &&
        !Number.isNaN(pos.Z)
      ) {
        currentPosition = { ...pos };
        addMove(currentCommand, pos.X, pos.Y, pos.Z, currentFeedrate, i);
      }
    }
  }

  return movements;
}
