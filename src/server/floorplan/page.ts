import { FLOORPLAN_TEMPLATE } from "@/vendor/floorplan/template.generated";

const DATA = "/*__FLOORPLAN_DATA__*/null";
const TITLE = "__FLOORPLAN_TITLE__";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** JSON that is safe inside a <script> element: no `</script`, and no raw U+2028/2029. */
export const scriptSafeJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "\\u003c!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** The Floorplan viewer page with one project's graph injected. Only graph JSON ever goes in — never HTML. */
export function renderFloorplanPage(graph: unknown, title: string) {
  return FLOORPLAN_TEMPLATE.replace(DATA, () => scriptSafeJson(graph)).replace(TITLE, () => escapeHtml(title));
}
