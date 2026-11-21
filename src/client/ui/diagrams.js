import { TRACES } from "../../content/algorithm-traces.js";
function graphSVG(nodes, edges, caption) {
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return `<figure class="diagram"><svg viewBox="0 0 700 330" role="img" aria-label="${caption}"><g stroke="#91a485" stroke-width="2" fill="none">${edges
    .map((e, i) => {
      const a = by[e[0]],
        b = by[e[1]],
        repeat = edges.slice(0, i).some((x) => x[0] === e[0] && x[1] === e[1]);
      return repeat
        ? `<path d="M${a.x},${a.y} Q${(a.x + b.x) / 2 + 50},${(a.y + b.y) / 2 - 50} ${b.x},${b.y}"/>`
        : `<path d="M${a.x},${a.y} L${b.x},${b.y}"/>`;
    })
    .join("")}</g>${edges
    .map((e, i) => {
      if (!e[2]) return "";
      const a = by[e[0]],
        b = by[e[1]],
        repeat = edges.slice(0, i).some((x) => x[0] === e[0] && x[1] === e[1]);
      return `<text x="${(a.x + b.x) / 2 + (repeat ? 30 : 0)}" y="${(a.y + b.y) / 2 - (repeat ? 25 : 9)}" text-anchor="middle" font-size="12" fill="#566e46">${e[2]}</text>`;
    })
    .join(
      "",
    )}${nodes.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="20" fill="#f1f5e9" stroke="#849b71"/><text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-size="14" fill="#34482d">${n.id}</text>`).join("")}</svg><figcaption>${caption}</figcaption></figure>`;
}
function diagram(kind) {
  if (kind === "avl")
    return graphSVG(
      TRACES.avl.nodes,
      TRACES.avl.edges,
      "Final AVL tree · balance factor = left height − right height",
    );
  if (kind === "incidence")
    return graphSVG(
      [
        { id: "v1", x: 190, y: 65 },
        { id: "v2", x: 470, y: 65 },
        { id: "v3", x: 50, y: 150 },
        { id: "v4", x: 190, y: 250 },
        { id: "v5", x: 470, y: 250 },
        { id: "v6", x: 630, y: 150 },
      ],
      [
        ["v1", "v2", "e1"],
        ["v2", "v6", "e2"],
        ["v2", "v5", "e3"],
        ["v1", "v4", "e4"],
        ["v1", "v3", "e5"],
        ["v4", "v5", "e6"],
        ["v2", "v5", "e7"],
        ["v5", "v6", "e8"],
      ],
      "Incidence-matrix graph · two parallel edges join v2 and v5",
    );
  if (kind === "bfs")
    return graphSVG(
      [
        { id: "0", x: 40, y: 165 },
        { id: "1", x: 180, y: 55 },
        { id: "7", x: 180, y: 275 },
        { id: "2", x: 350, y: 55 },
        { id: "8", x: 350, y: 165 },
        { id: "6", x: 350, y: 275 },
        { id: "3", x: 520, y: 55 },
        { id: "5", x: 520, y: 275 },
        { id: "4", x: 660, y: 165 },
      ],
      [
        ["0", "1"],
        ["0", "7"],
        ["1", "2"],
        ["1", "7"],
        ["2", "3"],
        ["2", "8"],
        ["2", "5"],
        ["3", "4"],
        ["3", "5"],
        ["4", "5"],
        ["5", "6"],
        ["6", "7"],
        ["6", "8"],
        ["7", "8"],
      ],
      "Unweighted view of the uploaded graph · BFS ignores the drawn weights",
    );
  if (kind === "vlsi")
    return `<figure class="diagram"><div class="flow-grid">${["1 · Specification", "2 · Architecture", "3 · HDL / FSM model", "4 · Simulate & verify", "5 · Synthesize netlist", "6 · Place, clock & route", "7 · Sign-off checks", "8 · Fabricate & test"].map((x) => `<div>${x}</div>`).join("")}</div><figcaption>ASIC design sequence. Iterate when verification fails; FPGA implementation ends in a bitstream.</figcaption></figure>`;
  if (kind === "fsm")
    return `<figure class="diagram"><svg viewBox="0 0 640 260" role="img" aria-label="Two-state toggle FSM"><defs><marker id="tip" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6Z" fill="#6a825b"/></marker></defs><g fill="none" stroke="#6a825b" stroke-width="2"><circle cx="170" cy="135" r="50"/><circle cx="470" cy="135" r="50"/><path d="M210 105 Q320 20 430 105 M430 165 Q320 240 210 165 M140 95 C60 0 260 0 200 95 M440 95 C360 0 560 0 500 95" marker-end="url(#tip)"/></g><g fill="#34482d" text-anchor="middle" font-size="17"><text x="170" y="130">S0</text><text x="170" y="150">y=0</text><text x="470" y="130">S1</text><text x="470" y="150">y=1</text><text x="320" y="58">x=1</text><text x="320" y="218">x=1</text><text x="170" y="25">x=0</text><text x="470" y="25">x=0</text></g></svg><figcaption>Reset → S0 · one D flip-flop · D=Q XOR x, y=Q</figcaption></figure>`;
  if (kind === "ttl")
    return `<figure class="diagram"><svg viewBox="0 0 650 410" role="img" aria-label="Simplified standard TTL NAND transistor circuit"><g fill="none" stroke="#526c47" stroke-width="2"><path d="M100 30H510 M150 30V55 M150 95V140 M150 140V180 M150 150L190 120H220V200H250 M150 160L100 190H35 M150 174L100 220H35 M250 180V220 M250 188L280 165V95 M280 30V55 M280 140H440 M250 212L280 240V275 M280 315V365 M280 240H380V310H440 M440 120V160 M440 128L470 105V95 M470 30V55 M440 152L470 175V200 M470 225V275L440 298 M440 290V330 M440 322L470 345V365 M470 260H590 M270 365H290 M460 365H480"/><rect x="143" y="55" width="14" height="40"/><rect x="273" y="55" width="14" height="40"/><rect x="463" y="55" width="14" height="40"/><rect x="273" y="275" width="14" height="40"/><path d="M460 200H480L470 220Z M458 225H482 M276 234l-9-2 4-7 M467 171l-9-2 4-7 M467 341l-9-2 4-7 M105 187l10-2-3-8 M105 217l10-2-3-8"/></g><g fill="#354b2c" font-size="14"><text x="300" y="22">VCC</text><text x="10" y="194">A</text><text x="10" y="224">B</text><text x="165" y="78">R1</text><text x="295" y="78">R2</text><text x="488" y="78">R4</text><text x="295" y="300">R3</text><text x="115" y="265">Q1 · multi-emitter</text><text x="195" y="245">Q2</text><text x="490" y="145">Q3 pull-up</text><text x="490" y="315">Q4 pull-down</text><text x="490" y="215">D</text><text x="595" y="265">Y</text><text x="283" y="390">GND</text><text x="465" y="390">GND</text></g></svg><figcaption>Representative standard TTL NAND (simplified). Q1 input stage, Q2 phase splitter, Q3/Q4 totem pole. Device subfamilies differ.</figcaption></figure>`;
  return "";
}

export { graphSVG, diagram };
