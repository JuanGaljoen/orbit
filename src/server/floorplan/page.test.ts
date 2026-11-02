import { describe, expect, it } from "vitest";
import { renderFloorplanPage } from "./page";

describe("renderFloorplanPage", () => {
  it("injects the graph and title, leaving no placeholder, cloud promo or live-server hook", () => {
    const html = renderFloorplanPage({ schema: "floorplan/graph@1", nodes: [], files: [], links: [] }, "Ring CAD map");
    expect(html).toContain('window.FLOORPLAN = {"schema":"floorplan/graph@1"');
    expect(html).toContain("<title>Ring CAD map</title>");
    expect(html).not.toMatch(/__FLOORPLAN_|\/\*__|<!--__/);
    expect(html).not.toContain("/api/cloud");
    expect(html).not.toMatch(/FLOORPLAN_SERVER\s*=/);
    expect(html).toContain("#ask{display:none!important}");
  });

  it("escapes anything that could break out of the script element or the title", () => {
    const html = renderFloorplanPage({ name: "</script><script>alert(1)</script> <!-- \u2028\u2029", $1: "$&" }, "<img onerror=x>");
    const data = html.slice(html.indexOf("window.FLOORPLAN = ") + 19, html.indexOf("</script>", html.indexOf("window.FLOORPLAN = ")));
    expect(data).not.toMatch(/<\/script|<!--|\u2028|\u2029/i);
    expect(JSON.parse(data.replace(/;$/, ""))).toMatchObject({ name: "</script><script>alert(1)</script> <!-- \u2028\u2029", $1: "$&" });
    expect(html).toContain("<title>&lt;img onerror=x&gt;</title>");
  });
});
