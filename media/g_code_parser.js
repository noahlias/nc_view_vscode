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

function tryProcessRParamAssignment(line, rParameters) {
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

function extractParametersFromLine(line, rParameters) {
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

    const numericValue = evaluateMacroExpression(rawValue, rParameters);
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
    if (line.startsWith(";") || line.startsWith("(") || line.startsWith("%")) continue;

    line = line.replace(/;.*$/, "").trim();
    if (line === "") continue;

    const upperLine = line.toUpperCase();

    if (tryProcessRParamAssignment(upperLine, rParameters)) {
      continue;
    }

    if (
      excludeCodes.some((code) =>
        upperLine.match(new RegExp(`\\b${code}(\\s|$)`, "i")),
      )
    ) {
      continue;
    }

    const params = extractParametersFromLine(upperLine, rParameters);

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

      if (rVal !== undefined) {
        const dx = endA - startA;
        const dy = endB - startB;
        const chord2 = dx * dx + dy * dy;
        const h = Math.sqrt(Math.max(0, rVal * rVal - chord2 / 4));
        const dir = currentCommand === "G2" ? -1 : 1;

        const mx = (startA + endA) / 2;
        const my = (startB + endB) / 2;
        const nx = -dy / Math.sqrt(chord2);
        const ny = dx / Math.sqrt(chord2);

        centerA = mx + dir * h * nx;
        centerB = my + dir * h * ny;
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

      let sweep = endAngle - startAngle;
      const isFullCircle =
        Math.hypot(endA - startA, endB - startB) < FULL_CIRCLE_TOLERANCE;

      if (isFullCircle) {
        sweep = currentCommand === 'G2' ? -2 * Math.PI : 2 * Math.PI;
      } else {
        if (currentCommand === "G2" && sweep > 0) sweep -= 2 * Math.PI;
        if (currentCommand === "G3" && sweep < 0) sweep += 2 * Math.PI;
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
