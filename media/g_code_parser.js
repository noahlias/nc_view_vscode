function parseGCode(
  gcode,
  segmentCount = 64,
  excludeCodes = ["G10", "G90", "G53", "G30"],
) {
  const lines = gcode.split("\n");
  const movements = [];

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
    let line = lines[i].toUpperCase().replace(/;.*$/, "").trim();
    if (line === "" || line.startsWith("(") || line.startsWith("%")) continue;

    if (
      excludeCodes.some((code) =>
        line.match(new RegExp("\b${code}(\s|$)", "i")),
      )
    ) {
      continue;
    }

    const tokens = [...line.matchAll(/([A-Z])([-+]?[0-9]*\.?[0-9]+)/g)];
    const params = {};

    for (const [, letter, value] of tokens) {
      if (!params[letter]) params[letter] = [];
      params[letter].push(parseFloat(value));
    }

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

      for (let j = 1; j <= segmentCount; j++) {
        const angle = startAngle + (sweep * j) / segmentCount;
        const ratio = j / segmentCount;
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
