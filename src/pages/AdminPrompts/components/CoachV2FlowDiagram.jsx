import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import CoachV2NodeTooltip, { NODES } from './CoachV2NodeTooltip';

/**
 * CoachV2FlowDiagram — Mermaid-rendered SVG of the V2 coach LangGraph flow,
 * with hover-over robot-illustration tooltips for each node.
 *
 * Spec mirrors graphs/coachV2/controller.js + edges.js (test-pilot-server):
 *   init → learn → generateApply → apply → grade → complete → reflect
 *                                            └── fail ──→ remediate ──→ (back to generateApply)
 *
 * Lives next to the code so the diagram stays in sync.
 */

// Horizontal left-to-right flow. Linear happy path with one remediation
// loop arcing back from Remediate to Generate Apply. No decision diamonds —
// the routing logic lives in graphs/coachV2/edges.js; this is the bird's-eye
// process view, not a detailed state machine.
//
// SECURITY: FLOW_SPEC MUST remain a static, hardcoded template literal — NEVER
// interpolate user input, props, server-supplied content, or runtime data
// into it. Mermaid is initialized with securityLevel:'strict' below AND the
// SVG is injected via dangerouslySetInnerHTML, but those mitigations only
// cover what Mermaid catches. If user-controlled text ever flows into this
// constant, it becomes a direct XSS vector at the SVG-injection point.
const FLOW_SPEC = `flowchart LR
  init["Init"]:::node --> learn["Learn"]:::node
  learn --> generateApply["Generate Challenge"]:::node
  generateApply --> apply["Apply"]:::node
  apply --> grade["Grade"]:::node
  grade --> complete["Complete"]:::node
  complete --> reflect["Reflect"]:::node
  grade -.->|"fail"| remediate["Remediate"]:::branch
  remediate -.->|"retry"| generateApply

  classDef node fill:#4242EA,stroke:#3232BA,color:#ffffff,stroke-width:2px,rx:8,ry:8;
  classDef branch fill:#FB923C,stroke:#C2410C,color:#ffffff,stroke-width:2px,rx:8,ry:8;
`;

let mermaidInitialized = false;

export default function CoachV2FlowDiagram() {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  // svgMarkup: the rendered Mermaid SVG string. Stored in state so React
  // owns its insertion via dangerouslySetInnerHTML — that's a flagged audit
  // surface a code scanner will see, vs. a plain ref.innerHTML write which
  // is invisible to most static analyzers. FLOW_SPEC is a hardcoded constant
  // (no user-controlled input) and mermaid is configured with
  // securityLevel:'strict', so the actual XSS risk is nil today; this is
  // about making the injection point auditable for future code.
  const [svgMarkup, setSvgMarkup] = useState('');
  // hoveredNode: which NODES key the mouse is currently over (null = none)
  // tooltipPos: viewport coords where the tooltip should render (above the node)
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;

    // Unique id per render so re-mounts don't collide. Declared out here so
    // the catch below can clean up mermaid's scratch div by id.
    const id = `coach-v2-flow-${Math.floor(performance.now())}`;

    async function render() {
      try {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            fontFamily: '"Proxima Nova", "Helvetica Neue", Arial, sans-serif',
            securityLevel: 'strict',
            // Mermaid renders into a scratch <div id="d{id}"> appended to
            // document.body, then removes it. On a render failure it instead
            // draws its 150px "Syntax error in text / mermaid version X" error
            // graph into that scratch div and rethrows BEFORE the cleanup runs
            // — so the giant text is orphaned in <body> (outside #root, above
            // all page content) for the rest of the SPA session, on every tab.
            // suppressErrorRendering makes the failure path clean up and just
            // throw; our own `error` state renders the message instead.
            suppressErrorRendering: true,
            flowchart: {
              htmlLabels: true,
              curve: 'basis',
              nodeSpacing: 50,
              rankSpacing: 60,
              padding: 20,
            },
            themeVariables: {
              primaryColor: '#4242EA',
              primaryTextColor: '#ffffff',
              primaryBorderColor: '#3232BA',
              lineColor: '#1E1E1E',
              secondaryColor: '#F5F5F5',
              tertiaryColor: '#ffffff',
              background: '#ffffff',
              fontSize: '14px',
            },
          });
          mermaidInitialized = true;
        }

        const { svg } = await mermaid.render(id, FLOW_SPEC);
        if (cancelled) return;
        setSvgMarkup(svg);
      } catch (err) {
        console.error('Mermaid render failed:', err);
        // Belt-and-suspenders on suppressErrorRendering: if mermaid ever throws
        // on a path that skips its own cleanup, drop the orphaned scratch div
        // ourselves so it can't sit in <body> over the page content.
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setError(err.message);
      }
    }

    render();
    return () => { cancelled = true; };
  }, []);

  // After React commits the svg into the container, attach hover handlers.
  // We match nodes by LABEL TEXT rather than the auto-generated id (which
  // varies across Mermaid versions). Re-runs whenever the svg changes (e.g.,
  // on remount or hot-reload).
  //
  // We listen on the CONTAINER with the bubbling mouseover/mouseout events
  // rather than per-node mouseenter/mouseleave. Mermaid renders node labels
  // as HTML inside <foreignObject> (htmlLabels: true), and a <g>'s own
  // mouseleave fires unreliably as the pointer crosses between the SVG shape
  // and the foreignObject HTML — that left tooltips stuck on screen and
  // blocked the other tooltips from ever showing. mouseover/mouseout bubble,
  // so we can resolve the hovered node via closest('g.node') and clear only
  // when the pointer truly leaves every node.
  useEffect(() => {
    if (!svgMarkup || !containerRef.current) return;
    const container = containerRef.current;
    const labelToKey = Object.entries(NODES).reduce((acc, [key, meta]) => {
      acc[meta.name.toLowerCase().trim()] = key;
      return acc;
    }, {});

    container.querySelectorAll('g.node').forEach((el) => {
      el.style.cursor = 'pointer';
    });

    const handleOver = (e) => {
      const g = e.target.closest && e.target.closest('g.node');
      if (!g || !container.contains(g)) return;
      const labelText = (g.textContent || '').toLowerCase().trim();
      const key = labelToKey[labelText];
      if (!key) return;
      const rect = g.getBoundingClientRect();
      setHoveredNode(key);
      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
    };

    const handleOut = (e) => {
      // If the pointer moved onto another node, the mouseover handler will
      // swap the tooltip — don't clear. Otherwise (gaps, edges, or leaving
      // the diagram entirely) hide it.
      const to = e.relatedTarget;
      if (to && to.closest && to.closest('g.node')) return;
      setHoveredNode(null);
    };

    container.addEventListener('mouseover', handleOver);
    container.addEventListener('mouseout', handleOut);
    return () => {
      container.removeEventListener('mouseover', handleOver);
      container.removeEventListener('mouseout', handleOut);
    };
  }, [svgMarkup]);

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm font-proxima text-amber-900">
        Diagram failed to render: {error}
      </div>
    );
  }

  return (
    <>
      {/* Force the dashed-edge labels ("fail" / "retry") to render in Carbon
          Black — Mermaid's base theme leaves them light/white against the
          white card, making them invisible. */}
      <style>{`
        .coach-v2-flow .edgeLabel,
        .coach-v2-flow .edgeLabel p,
        .coach-v2-flow .edgeLabel span,
        .coach-v2-flow .edgeLabel text {
          color: #1E1E1E;
          fill: #1E1E1E;
          background-color: #ffffff;
        }
      `}</style>
      <div
        ref={containerRef}
        className="coach-v2-flow w-full overflow-x-auto flex justify-center bg-white rounded-lg p-2"
        aria-label="V2 Coach LangGraph flow diagram"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {/* Tooltip overlay — fixed-position so it floats above the diagram and
          isn't clipped by the surrounding card's overflow. pointer-events-none
          so it can never sit between the cursor and a node and trap hover. */}
      {hoveredNode && (
        <div
          className="fixed z-50 transition-opacity duration-100 pointer-events-none"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          <CoachV2NodeTooltip nodeKey={hoveredNode} />
          {/* Down-pointing arrow */}
          <div className="flex justify-center">
            <div
              className="w-0 h-0"
              style={{
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid #1E1E1E',
                marginTop: '-1px',
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
