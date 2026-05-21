const $ = (id) => document.getElementById(id);

const fields = [
  "openingWidth",
  "openingLength",
  "floorHeight",
  "stairWidth",
  "sideFinish",
  "bottomFinish",
  "topFinish",
  "treadFinish",
  "riserMin",
  "riserMax",
  "treadMin",
  "treadMax",
  "allowExtraSteps",
  "extraRisers",
  "turnType",
  "landingWall",
  "landingDepth",
  "turnStepCount",
  "earlySteps",
  "landingTurn",
  "inlineLandingDepth",
];

const modeInputs = [...document.querySelectorAll("input[name='mode']")];

function num(id) {
  return Number($(id).value || 0);
}

function activeMode() {
  return document.querySelector("input[name='mode']:checked").value;
}

function mm(value, digits = 0) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}mm`;
}

function getInputs() {
  const sideFinish = num("sideFinish");
  return {
    mode: activeMode(),
    openingWidth: num("openingWidth"),
    openingLength: num("openingLength"),
    floorHeight: num("floorHeight"),
    stairWidth: num("stairWidth"),
    usableWidth: Math.max(0, num("openingWidth") - sideFinish * 2),
    usableLength: Math.max(0, num("openingLength") - sideFinish * 2),
    adjustedHeight: Math.max(0, num("floorHeight") + num("topFinish") - num("bottomFinish")),
    treadFinish: num("treadFinish"),
    riserMin: num("riserMin"),
    riserMax: num("riserMax"),
    treadMin: num("treadMin"),
    treadMax: num("treadMax"),
    allowExtraSteps: $("allowExtraSteps").checked,
    extraRisers: num("extraRisers"),
    turnType: "180",
    landingWall: $("landingWall").value,
    landingDepth: num("landingDepth"),
    turnStepCount: $("turnStepCount").value,
    earlySteps: num("earlySteps"),
    landingTurn: $("landingTurn").value,
    inlineLandingDepth: num("inlineLandingDepth"),
  };
}

function scoreCandidate(candidate, input) {
  const comfort = candidate.riser * 2 + candidate.tread;
  const riserTarget = (input.riserMin + input.riserMax) / 2;
  const treadTarget = (input.treadMin + input.treadMax) / 2;
  const comfortPenalty = comfort < 600 ? (600 - comfort) * 2 : comfort > 650 ? (comfort - 650) * 2 : 0;
  const sizePenalty = Math.abs(candidate.riser - riserTarget) * 0.65 + Math.abs(candidate.tread - treadTarget) * 0.35;
  const overflowPenalty = Math.max(0, candidate.requiredRun - candidate.availableRun) * 7;
  const secondaryOverflow = candidate.layout?.secondaryRun
    ? Math.max(0, candidate.layout.secondaryRun - candidate.layout.availableSecondary) * 7
    : 0;
  const turnStepPenalty = candidate.layout?.turnSteps ? candidate.layout.turnSteps * 18 : 0;
  const turnRulePenalty = candidate.layout?.turnValid === false ? 100000 : 0;
  const heightCenterPenalty = candidate.layout?.heightOffset ? candidate.layout.heightOffset * 1.5 : 0;
  const nonstandardPenalty = candidate.nonstandard ? 55 : 0;
  const widthPenalty = candidate.widthOk ? 0 : 10000;
  return comfortPenalty + sizePenalty + overflowPenalty + secondaryOverflow + turnStepPenalty + turnRulePenalty + heightCenterPenalty + nonstandardPenalty + widthPenalty;
}

function turnLayout(input, treadCount, tread, riser) {
  const flightRunLimit = Math.max(0, input.usableLength - input.landingDepth);
  const flightCapacity = Math.max(0, Math.floor(flightRunLimit / Math.max(tread, 1)));
  const requestedTurnSteps = input.turnStepCount === "auto" ? null : Number(input.turnStepCount);
  const autoTurnSteps = Math.max(0, treadCount - Math.min(Math.floor(treadCount / 2), flightCapacity) * 2);
  const targetTurnSteps = requestedTurnSteps ?? Math.min(4, autoTurnSteps);
  const parityOk = (treadCount - targetTurnSteps) % 2 === 0;
  const requestedFits = targetTurnSteps >= 0 && targetTurnSteps <= 4 && targetTurnSteps <= treadCount;
  const equalFlightCount = parityOk && requestedFits ? (treadCount - targetTurnSteps) / 2 : Math.floor((treadCount - targetTurnSteps) / 2);
  const firstFlight = Math.min(Math.max(0, equalFlightCount), flightCapacity);
  const secondFlight = firstFlight;
  const turnSteps = Math.max(0, treadCount - firstFlight - secondFlight);
  const requiredRun = Math.max(firstFlight * tread, secondFlight * tread) + input.landingDepth;
  const turnCenterHeight = (firstFlight + turnSteps / 2) * riser;
  const targetHeight = input.adjustedHeight / 2;
  const heightOffset = Math.abs(turnCenterHeight - targetHeight);
  return {
    firstFlight,
    secondFlight,
    turnSteps,
    turnCenterHeight,
    targetHeight,
    heightOffset,
    requiredRun,
    secondaryRun: input.stairWidth * 2,
    availableSecondary: input.usableWidth,
    requestedTurnSteps,
    turnValid: turnSteps <= 4 && firstFlight === secondFlight && heightOffset <= riser && (requestedTurnSteps === null || turnSteps === requestedTurnSteps),
  };
}

function makeCandidate(input, riserCount, tread, availableRun) {
  const treadCount = Math.max(0, riserCount - 1);
  const riser = input.adjustedHeight / riserCount;
  const finishedTread = Math.max(0, tread - input.treadFinish);
  let requiredRun = treadCount * finishedTread;
  let layout = {};

  if (input.mode === "turn") {
    layout = turnLayout(input, treadCount, finishedTread, riser);
    requiredRun = layout.requiredRun;
  }

  if (input.mode === "straightLanding") {
    const lowerTreads = Math.min(input.earlySteps, treadCount);
    const upperTreads = Math.max(0, treadCount - lowerTreads);
    layout = {
      lowerTreads,
      upperTreads,
      secondaryRun: input.inlineLandingDepth + upperTreads * finishedTread,
      availableSecondary: input.usableWidth,
    };
    requiredRun = lowerTreads * finishedTread + input.inlineLandingDepth;
  }

  return {
    riserCount,
    treadCount,
    riser,
    tread: finishedTread,
    rawTread: tread,
    requiredRun,
    availableRun,
    widthOk: widthFits(input),
    layout,
    comfort: riser * 2 + finishedTread,
    nonstandard: riser < input.riserMin || riser > input.riserMax || finishedTread < input.treadMin || finishedTread > input.treadMax,
  };
}

function widthFits(input) {
  if (input.mode === "turn") {
    return input.usableWidth >= input.stairWidth * 2;
  }
  return input.usableWidth >= input.stairWidth;
}

function availableRun(input) {
  if (input.mode === "turn") return input.usableLength;
  return input.usableLength;
}

function calculate() {
  const input = getInputs();
  const candidates = [];
  const minRisers = Math.max(1, Math.ceil(input.adjustedHeight / input.riserMax));
  const standardMaxRisers = Math.max(minRisers, Math.floor(input.adjustedHeight / input.riserMin));
  const maxRisers = input.allowExtraSteps ? standardMaxRisers + input.extraRisers : standardMaxRisers;
  const treadStart = input.allowExtraSteps ? Math.max(160, input.treadMin - 100) : input.treadMin;
  const runLimit = availableRun(input);

  for (let risers = minRisers; risers <= maxRisers; risers += 1) {
    for (let tread = treadStart; tread <= input.treadMax; tread += 5) {
      const candidate = makeCandidate(input, risers, tread, runLimit);
      candidate.score = scoreCandidate(candidate, input);
      candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0] || makeCandidate(input, minRisers, input.treadMin, runLimit);
  render(input, best, candidates);
}

function render(input, best, candidates) {
  const secondaryFits = !best.layout?.secondaryRun || best.layout.secondaryRun <= best.layout.availableSecondary;
  const turnRulesOk = best.layout?.turnValid !== false;
  const fits = best.requiredRun <= best.availableRun && secondaryFits && turnRulesOk && best.widthOk;
  const near = best.requiredRun <= best.availableRun * 1.08 && secondaryFits && turnRulesOk && best.widthOk;
  const status = $("fitStatus");
  status.className = "status";
  status.classList.add(fits ? "good" : near ? "warn" : "bad");
  status.textContent = fits ? "권장 범위 가능" : near ? "근접 검토" : "공간 부족";

  $("riserCount").textContent = `${best.riserCount}단`;
  $("riserHeight").textContent = mm(best.riser, 1);
  $("treadDepth").textContent = mm(best.tread, 0);
  $("requiredRun").textContent = mm(best.requiredRun, 0);
  $("usableSize").textContent = `유효 개구부 ${mm(input.usableWidth)} x ${mm(input.usableLength)}, 보정 층고 ${mm(input.adjustedHeight)}`;

  renderDetails(input, best, candidates);
  renderWarnings(input, best, fits);
  renderPlan(input, best);
}

function renderDetails(input, best, candidates) {
  const labels = {
    turn: "계단참 후 꺾임",
    straight: "일자형",
    straightLanding: "초반 계단참 90도형",
  };
  const fitCount = candidates.filter((item) => {
    const secondaryOk = !item.layout?.secondaryRun || item.layout.secondaryRun <= item.layout.availableSecondary;
    const turnOk = item.layout?.turnValid !== false;
    return item.requiredRun <= item.availableRun && secondaryOk && turnOk && item.widthOk;
  }).length;
  const split =
    input.mode === "turn"
      ? `${best.layout.firstFlight}칸 + 회전부 ${best.layout.turnSteps}칸 + ${best.layout.secondFlight}칸`
      : input.mode === "straightLanding"
        ? `${best.layout.lowerTreads}칸 + 계단참 + 90도 ${best.layout.upperTreads}칸`
        : `${best.treadCount}칸`;
  const stringerRun =
    input.mode === "turn"
      ? `${mm(best.layout.firstFlight * best.tread)} + ${mm(best.layout.secondFlight * best.tread)}`
      : input.mode === "straightLanding"
        ? `${mm(best.layout.lowerTreads * best.tread)} + ${mm(best.layout.upperTreads * best.tread)}`
        : mm(best.requiredRun);
  const landingSize =
    input.mode === "turn"
      ? `${mm(input.stairWidth * 2)} x ${mm(input.landingDepth)}`
      : input.mode === "straightLanding"
        ? `${mm(input.inlineLandingDepth)} x ${mm(input.inlineLandingDepth)}`
        : "없음";

  $("resultList").innerHTML = [
    ["선택 방식", labels[input.mode]],
    ["계단 구성", split],
    ["챌판 수 / 디딤판 수", `${best.riserCount}단 / ${best.treadCount}칸`],
    ...(input.mode === "turn" ? [["회전부 계단 수", `${best.layout.turnSteps}칸 / 최대 4칸${best.layout.requestedTurnSteps === null ? " / 자동" : ""}`]] : []),
    ...(input.mode === "turn" ? [["계단참 위치", input.landingWall === "top" ? "위쪽 벽 중앙" : "아래쪽 벽 중앙"]] : []),
    ...(input.mode === "turn" ? [["회전부 분할", "계단 2열과 계단참이 만나는 꼭지점 기준"]] : []),
    ...(input.mode === "turn" ? [["회전부 중심 높이", `${mm(best.layout.turnCenterHeight, 1)} / 중간 ${mm(best.layout.targetHeight, 1)}`]] : []),
    ...(input.mode === "straightLanding" ? [["계단참 전 단수", `${best.layout.lowerTreads}단 입력`]] : []),
    ...(input.mode === "straightLanding" ? [["꺾임 방향", input.landingTurn === "left" ? "왼쪽 90도" : "오른쪽 90도"]] : []),
    ["스트링거 평면 길이", stringerRun],
    ["계단참/회전부 사이즈", landingSize],
    ["기준 외 여부", best.nonstandard ? "권장 범위 밖 포함" : "권장 범위 안"],
    ["권장 보행식", `2R + T = ${best.comfort.toFixed(1)}mm`],
    ["공간 여유", `${(best.availableRun - best.requiredRun).toFixed(0)}mm`],
    ["계단 폭 판정", best.widthOk ? "폭 가능" : "폭 부족"],
    ["권장 범위 후보", `${fitCount}개`],
  ]
    .map(([term, desc]) => `<dt>${term}</dt><dd>${desc}</dd>`)
    .join("");
}

function renderWarnings(input, best, fits) {
  const notes = [];
  if (!best.widthOk) {
    const requiredWidth = input.mode === "turn" ? input.stairWidth * 2 : input.stairWidth;
    notes.push(`현재 방식에는 유효 가로 ${mm(requiredWidth)} 이상이 필요합니다.`);
  }
  if (best.requiredRun > best.availableRun) {
    notes.push(`평면 길이가 ${mm(best.requiredRun - best.availableRun)} 정도 부족합니다. 디딤판 폭, 회전부 크기, 단수 기준을 조정해 보세요.`);
  }
  if (best.layout?.secondaryRun && best.layout.secondaryRun > best.layout.availableSecondary) {
    notes.push(`90도 꺾임 방향 배치가 ${mm(best.layout.secondaryRun - best.layout.availableSecondary)} 정도 부족합니다.`);
  }
  if (best.layout?.turnSteps > 4) {
    notes.push(`회전부에 ${best.layout.turnSteps}칸이 필요해서 현재 조건의 최대 4칸을 넘습니다.`);
  }
  if (input.mode === "turn" && best.layout?.requestedTurnSteps !== null && best.layout?.turnSteps !== best.layout?.requestedTurnSteps) {
    notes.push(`지정한 회전부 ${best.layout.requestedTurnSteps}칸과 위/아래 동일 계단 수 조건을 동시에 만족하는 후보가 부족합니다.`);
  }
  if (input.mode === "turn" && best.layout?.firstFlight !== best.layout?.secondFlight) {
    notes.push("계단참 후 꺾임 방식은 아래쪽과 위쪽 직선 구간의 계단 수가 같아야 합니다.");
  }
  if (input.mode === "turn" && best.layout?.heightOffset > best.riser) {
    notes.push(`회전부 중심 높이가 층고 중간에서 ${mm(best.layout.heightOffset, 1)} 벗어납니다.`);
  }
  if (best.comfort < 600 || best.comfort > 650) {
    notes.push("2R+T 값이 일반적인 보행 권장 범위 600-650mm를 벗어납니다.");
  }
  if (best.nonstandard) {
    notes.push("기준 외 단수 허용으로 권장 챌판/디딤판 범위를 벗어난 후보를 포함했습니다. 실제 시공 가능 여부는 현장 기준으로 확인해야 합니다.");
  }
  if (input.treadFinish > 0) {
    notes.push(`디딤판 마감 ${mm(input.treadFinish)}를 차감해 실제 사용 디딤판 폭으로 계산했습니다.`);
  }
  if (fits) {
    notes.push("입력한 권장 범위 안에서 배치 가능한 조합이 있습니다. 실제 시공 전에는 구조체, 난간, 마감선, 헤드룸을 별도로 확인해야 합니다.");
  }
  $("warnings").innerHTML = notes.map((note) => `<li>${note}</li>`).join("");
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function renderPlan(input, best) {
  const svg = $("planSvg");
  svg.innerHTML = "";
  const pad = 54;
  const maxW = 720 - pad * 2;
  const maxH = 520 - pad * 2;
  const scale = Math.min(maxW / Math.max(input.usableWidth, 1), maxH / Math.max(input.usableLength, 1));
  const ox = (720 - input.usableWidth * scale) / 2;
  const oy = (520 - input.usableLength * scale) / 2;
  const sx = (v) => ox + v * scale;
  const sy = (v) => oy + v * scale;
  const sw = (v) => v * scale;

  svg.appendChild(svgEl("rect", {
    x: sx(0),
    y: sy(0),
    width: sw(input.usableWidth),
    height: sw(input.usableLength),
    rx: 6,
    class: "opening",
  }));
  const defs = svgEl("defs");
  const marker = svgEl("marker", {
    id: "arrowHead",
    markerWidth: 8,
    markerHeight: 8,
    refX: 6,
    refY: 3,
    orient: "auto",
    markerUnits: "strokeWidth",
  });
  marker.appendChild(svgEl("path", { d: "M0,0 L0,6 L7,3 z", fill: "#a04517" }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  if (input.mode === "turn") renderTurnPlan(svg, input, best, sx, sy, sw);
  if (input.mode === "straight") renderStraightPlan(svg, input, best, sx, sy, sw);
  if (input.mode === "straightLanding") renderStraightLandingPlan(svg, input, best, sx, sy, sw);

  svg.appendChild(svgEl("line", { x1: sx(0), y1: sy(input.usableLength + 26), x2: sx(input.usableWidth), y2: sy(input.usableLength + 26), class: "dim-line" }));
  svg.appendChild(svgEl("text", { x: sx(input.usableWidth / 2), y: sy(input.usableLength + 46), "text-anchor": "middle", class: "svg-note" })).textContent = `가로 ${mm(input.usableWidth)}`;
  svg.appendChild(svgEl("text", { x: sx(input.usableWidth + 18), y: sy(input.usableLength / 2), "writing-mode": "vertical-rl", class: "svg-note" })).textContent = `세로 ${mm(input.usableLength)}`;
}

function drawTreads(svg, x, y, width, run, count, vertical = true) {
  const safeCount = Math.max(1, count);
  for (let i = 1; i < safeCount; i += 1) {
    const offset = (run / safeCount) * i;
    const attrs = vertical
      ? { x1: x, y1: y + offset, x2: x + width, y2: y + offset, class: "step-line" }
      : { x1: x + offset, y1: y, x2: x + offset, y2: y + width, class: "step-line" };
    svg.appendChild(svgEl("line", attrs));
  }
}

function drawArrow(svg, points) {
  if (points.length < 2) return;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`)
    .join(" ");
  svg.appendChild(svgEl("path", {
    d: path,
    fill: "none",
    stroke: "#a04517",
    "stroke-width": 3,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "marker-end": "url(#arrowHead)",
  }));
}

function drawPlanLabel(svg, x, y, text, anchor = "middle") {
  svg.appendChild(svgEl("text", {
    x,
    y,
    "text-anchor": anchor,
    class: "svg-note",
  })).textContent = text;
}

function renderTurnPlan(svg, input, best, sx, sy, sw) {
  const w = input.stairWidth;
  const firstRun = best.layout.firstFlight * best.tread;
  const secondRun = best.layout.secondFlight * best.tread;
  const landing = input.landingDepth;

  const groupWidth = w * 2;
  const x1 = Math.max(0, (input.usableWidth - groupWidth) / 2);
  const x2 = x1 + w;
  const run = Math.min(input.usableLength - landing, Math.max(firstRun, secondRun));
  const landingY = input.landingWall === "top" ? 0 : input.usableLength - landing;
  const flightY = input.landingWall === "top" ? landing : landingY - run;
  const secondY = flightY;

  svg.appendChild(svgEl("rect", { x: sx(x1), y: sy(flightY), width: sw(w), height: sw(run), class: "stair" }));
  svg.appendChild(svgEl("rect", { x: sx(x2), y: sy(secondY), width: sw(w), height: sw(run), class: "stair" }));
  svg.appendChild(svgEl("rect", { x: sx(x1), y: sy(landingY), width: sw(groupWidth), height: sw(landing), class: "landing" }));
  drawTreads(svg, sx(x1), sy(flightY), sw(w), sw(run), best.layout.firstFlight, true);
  drawTreads(svg, sx(x2), sy(secondY), sw(w), sw(run), best.layout.secondFlight, true);
  drawTurnSteps(svg, sx(x1), sy(landingY), sw(groupWidth), sw(landing), best.layout.turnSteps, input.landingWall);
  const lowerStartY = input.landingWall === "top" ? flightY + run : flightY;
  const lowerEndY = input.landingWall === "top" ? landingY + landing * 0.6 : landingY + landing * 0.4;
  const upperStartY = lowerEndY;
  const upperEndY = input.landingWall === "top" ? secondY + run : secondY;
  drawArrow(svg, [
    [sx(x1 + w / 2), sy(lowerStartY)],
    [sx(x1 + w / 2), sy(lowerEndY)],
    [sx(x2 + w / 2), sy(upperStartY)],
    [sx(x2 + w / 2), sy(upperEndY)],
  ]);
  drawPlanLabel(svg, sx(x1 + w / 2), sy(flightY + run / 2), `스트링거 ${mm(firstRun)}`);
  drawPlanLabel(svg, sx(x2 + w / 2), sy(secondY + run / 2), `스트링거 ${mm(secondRun)}`);
  drawPlanLabel(svg, sx(x1 + groupWidth / 2), sy(landingY + landing - 18), `${mm(groupWidth)} x ${mm(landing)}`);

  svg.appendChild(svgEl("text", { x: sx(input.usableWidth / 2), y: sy(24), "text-anchor": "middle", class: "svg-label" })).textContent = "계단참 후 꺾임";
}

function turnBoundaryPoint(x, y, width, height, ratio, landingWall) {
  const area = width * height * ratio;
  const quarter = width * height / 4;
  const threeQuarter = width * height * 3 / 4;
  let px;
  let py;

  if (area <= quarter) {
    px = x;
    py = y + (area * 4) / width;
  } else if (area <= threeQuarter) {
    px = x + ((area - quarter) * 2) / height;
    py = y + height;
  } else {
    px = x + width;
    py = y + height - ((area - threeQuarter) * 4) / width;
  }

  if (landingWall === "top") {
    py = y + height - (py - y);
  }

  return { x: px, y: py };
}

function drawTurnSteps(svg, x, y, width, height, count, landingWall) {
  if (!count) return;
  const vertexX = x + width / 2;
  const vertexY = landingWall === "top" ? y + height : y;
  for (let i = 1; i < count; i += 1) {
    const point = turnBoundaryPoint(x, y, width, height, i / count, landingWall);
    svg.appendChild(svgEl("line", {
      x1: vertexX,
      y1: vertexY,
      x2: point.x,
      y2: point.y,
      class: "step-line",
    }));
  }
  svg.appendChild(svgEl("circle", {
    cx: vertexX,
    cy: vertexY,
    r: 3,
    fill: "#255f8a",
  }));
  svg.appendChild(svgEl("text", {
    x: x + width / 2,
    y: y + height / 2,
    "text-anchor": "middle",
    class: "svg-note",
  })).textContent = `회전 ${count}칸`;
}

function renderStraightPlan(svg, input, best, sx, sy, sw) {
  const run = Math.min(best.requiredRun, input.usableLength);
  const x = (input.usableWidth - input.stairWidth) / 2;
  svg.appendChild(svgEl("rect", { x: sx(x), y: sy(0), width: sw(input.stairWidth), height: sw(run), class: "stair" }));
  drawTreads(svg, sx(x), sy(0), sw(input.stairWidth), sw(run), best.treadCount, true);
  drawArrow(svg, [
    [sx(x + input.stairWidth / 2), sy(input.usableLength)],
    [sx(x + input.stairWidth / 2), sy(0)],
  ]);
  drawPlanLabel(svg, sx(x + input.stairWidth / 2), sy(run / 2), `스트링거 ${mm(best.requiredRun)}`);
  svg.appendChild(svgEl("text", { x: sx(input.usableWidth / 2), y: sy(24), "text-anchor": "middle", class: "svg-label" })).textContent = "일자형";
}

function renderStraightLandingPlan(svg, input, best, sx, sy, sw) {
  const landing = input.inlineLandingDepth;
  const upperRun = best.layout.upperTreads * best.tread;
  const lower = best.layout.lowerTreads * best.tread;
  const groupWidth = landing + upperRun;
  const groupX = Math.max(0, (input.usableWidth - groupWidth) / 2);
  const landingX = input.landingTurn === "left" ? groupX + upperRun : groupX;
  const landingY = lower;
  const lowerX = landingX + Math.max(0, (landing - input.stairWidth) / 2);
  const upperX = input.landingTurn === "left" ? landingX - upperRun : landingX + landing;
  const upperY = landingY + Math.max(0, (landing - input.stairWidth) / 2);

  svg.appendChild(svgEl("rect", { x: sx(lowerX), y: sy(0), width: sw(input.stairWidth), height: sw(lower), class: "stair" }));
  svg.appendChild(svgEl("rect", { x: sx(landingX), y: sy(landingY), width: sw(landing), height: sw(landing), class: "landing" }));
  svg.appendChild(svgEl("rect", { x: sx(upperX), y: sy(upperY), width: sw(upperRun), height: sw(input.stairWidth), class: "stair" }));
  drawTreads(svg, sx(lowerX), sy(0), sw(input.stairWidth), sw(lower), best.layout.lowerTreads, true);
  drawTreads(svg, sx(upperX), sy(upperY), sw(input.stairWidth), sw(upperRun), best.layout.upperTreads, false);
  const upperEndX = input.landingTurn === "left" ? upperX : upperX + upperRun;
  drawArrow(svg, [
    [sx(lowerX + input.stairWidth / 2), sy(0)],
    [sx(lowerX + input.stairWidth / 2), sy(landingY + landing / 2)],
    [sx(upperEndX), sy(upperY + input.stairWidth / 2)],
  ]);
  drawPlanLabel(svg, sx(lowerX + input.stairWidth / 2), sy(lower / 2), `스트링거 ${mm(lower)}`);
  drawPlanLabel(svg, sx(upperX + upperRun / 2), sy(upperY + input.stairWidth / 2), `스트링거 ${mm(upperRun)}`);
  drawPlanLabel(svg, sx(landingX + landing / 2), sy(landingY + landing - 18), `${mm(landing)} x ${mm(landing)}`);
  svg.appendChild(svgEl("text", { x: sx(input.usableWidth / 2), y: sy(24), "text-anchor": "middle", class: "svg-label" })).textContent = "초반 계단참 90도형";
}

function syncModeControls() {
  const mode = activeMode();
  $("turnSettings").hidden = mode !== "turn";
  $("straightLandingSettings").hidden = mode !== "straightLanding";
}

fields.forEach((id) => $(id).addEventListener("input", calculate));
modeInputs.forEach((input) => input.addEventListener("change", () => {
  syncModeControls();
  calculate();
}));

syncModeControls();
calculate();
