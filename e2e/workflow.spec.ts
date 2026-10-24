import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../playwright.config";

/** The spec's completion workflow, end to end, in one browser session. */
test.describe.configure({ mode: "serial" });

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const GH_REPO = process.env.E2E_GITHUB_REPO ?? "JuanGaljoen/orbit";

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test("1. create a project", async () => {
  await page.goto("/");
  await expect(page.getByText("Welcome to Orbit")).toBeVisible();
  await page.goto("/projects?new=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Orbit E2E");
  await dialog.getByLabel("Key").fill("OE");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/OE$/);
  await expect(page.getByRole("heading", { name: /Orbit E2E/ })).toBeVisible();
});

test("2. define an objective and a milestone", async () => {
  await page.goto("/objectives");
  await page.getByRole("button", { name: "New objective" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Ship Orbit v1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ship Orbit v1")).toBeVisible();

  await page.goto("/projects/OE?tab=settings");
  await page.getByLabel("Objective").selectOption({ label: "Ship Orbit v1" });
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Project saved")).toBeVisible();

  await page.goto("/projects/OE?tab=milestones");
  await page.getByRole("button", { name: "New milestone" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("MVP");
  await dialog.getByLabel("Start").fill(iso(-7));
  await dialog.getByLabel("Target").fill(iso(14));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Milestone created")).toBeVisible();
  await page.goto("/objectives");
  await expect(page.getByRole("main").getByRole("link", { name: /OE Orbit E2E/ })).toBeVisible();
});

async function quickCreate(title: string, opts: { priority?: string; milestone?: string; estimate?: string } = {}) {
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New ticket" });
  await dialog.getByLabel("Title").fill(title);
  if (opts.priority) await dialog.getByLabel("Priority").selectOption({ label: opts.priority });
  if (opts.milestone) await dialog.getByLabel("Milestone").selectOption({ label: opts.milestone });
  if (opts.estimate) await dialog.getByLabel("Estimate").fill(opts.estimate);
  await dialog.getByLabel("Acceptance criteria").fill("- [ ] it works");
  await dialog.getByRole("button", { name: "Create ticket" }).click();
  await expect(dialog).toBeHidden();
}

test("3. create tickets with a dependency", async () => {
  await page.goto("/projects/OE");
  await quickCreate("Build the board", { priority: "High", milestone: "MVP", estimate: "3" });
  await quickCreate("Wire the API", { milestone: "MVP", estimate: "2" });

  await page.goto("/tickets/OE-1");
  await expect(page.getByRole("heading", { name: "Build the board" })).toBeVisible();
  await page.getByRole("button", { name: "Add blocker" }).click();
  await page.getByPlaceholder("Search tickets by key or title…").fill("OE-2");
  await page.getByRole("button", { name: /OE-2 Wire the API/ }).click();
  await expect(page.getByText("OE-2 now blocks OE-1")).toBeVisible();
  await expect(page.getByText("Blocked", { exact: true }).first()).toBeVisible();

  await page.getByPlaceholder(/Write a comment/).fill("Starting with **drag and drop**.");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.locator("strong", { hasText: "drag and drop" })).toBeVisible();
});

test("4. move a ticket on the Kanban board", async () => {
  await page.goto("/board");
  await page.getByRole("main").getByRole("link", { name: /OE Orbit E2E/ }).click();
  await expect(page).toHaveURL(/\/board\/OE$/);
  const card = page.locator("a", { hasText: "Wire the API" });
  const target = page.locator("div.w-72", { hasText: "In Progress" }).first();
  await expect(card).toBeVisible();
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.goto("/tickets/OE-2");
  await expect(page.getByText("Todo → In Progress").or(page.getByText("Backlog → In Progress"))).toBeVisible();
});

test("5–6. connect a GitHub repository and link code activity", async () => {
  test.skip(!process.env.GITHUB_TOKEN, "GITHUB_TOKEN not provided");
  await page.goto("/github");
  await page.getByPlaceholder("owner/repo").fill(GH_REPO);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Initial sync complete")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("sync: ok")).toBeVisible();

  await page.goto("/projects/OE?tab=settings");
  await page.getByLabel(GH_REPO).check();
  await page.getByRole("button", { name: "Save repositories" }).click();
  await expect(page.getByText("Repositories updated")).toBeVisible();

  // A signed pull_request webhook mentioning OE-2, as GitHub would send it.
  const payload = JSON.stringify({
    action: "opened",
    repository: { full_name: GH_REPO },
    pull_request: {
      number: 4242, title: "OE-2 wire the API", body: "", state: "open", draft: false, merged: false,
      head: { ref: "oe-2-wire-api", sha: "e2e0000000000000000000000000000000000000" }, base: { ref: "main" },
      user: { login: "e2e" }, html_url: `https://github.com/${GH_REPO}/pull/4242`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  });
  const sign = (body: string) => `sha256=${createHmac("sha256", E2E.webhookSecret).update(body).digest("hex")}`;
  const headers = { "content-type": "application/json", "x-github-event": "pull_request", "x-github-delivery": "e2e-delivery-1" };
  expect((await page.request.post("/api/github/webhook", { data: payload, headers: { ...headers, "x-hub-signature-256": "sha256=bad" } })).status()).toBe(401);
  const ok = await page.request.post("/api/github/webhook", { data: payload, headers: { ...headers, "x-hub-signature-256": sign(payload) } });
  expect(await ok.json()).toEqual({ status: "processed" });
  const dup = await page.request.post("/api/github/webhook", { data: payload, headers: { ...headers, "x-hub-signature-256": sign(payload) } });
  expect(await dup.json()).toEqual({ status: "duplicate" });

  await page.goto("/tickets/OE-2");
  await expect(page.getByRole("link", { name: /#4242 OE-2 wire the API/ })).toBeVisible();
  await expect(page.getByText(/Suggest\s+In Review/)).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Status updated")).toBeVisible();
  await expect(page.getByText("In Progress → In Review")).toBeVisible();
});

test("7. visualise progress on the roadmap", async () => {
  await page.goto("/roadmap");
  await expect(page.getByRole("link", { name: "OE — Orbit E2E" })).toBeVisible();
  await expect(page.locator("a[title^='MVP:']")).toBeVisible();
  await expect(page.getByText("Planned vs completed (90 days)")).toBeVisible();
  await page.goto("/roadmap?tickets=1");
  await expect(page.getByRole("link", { name: "OE-1 Build the board" })).toBeVisible();
});

test("8. assistant without credentials degrades clearly", async () => {
  await page.goto("/assistant");
  await expect(page.getByText(/Set\s+ANTHROPIC_API_KEY/)).toBeVisible();
});

test("9. review, edit and apply a proposed ticket", async () => {
  const auth = { authorization: `Bearer ${E2E.apiToken}` };
  expect((await page.request.get("/api/v1/tickets")).status()).toBe(401);
  const res = await page.request.post("/api/v1/proposals", {
    headers: auth,
    data: {
      title: "Search follow-up",
      summary: "From an implementation session",
      items: [{ type: "create_ticket", ref: "t1", project: "OE", title: "Build the board again", priority: "Medium", blockedBy: ["OE-2"] }],
    },
  });
  expect(res.status()).toBe(200);
  const { reviewUrl } = await res.json();
  await page.goto(reviewUrl);
  await expect(page.getByText(/Possible duplicate of/)).toBeVisible();
  await page.getByLabel("Title").fill("Global search");
  await page.getByRole("button", { name: "Apply 1 change(s)" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Proposal applied")).toBeVisible();

  const brief = await page.request.get("/api/v1/tickets/OE-3/brief", { headers: auth });
  expect(await brief.text()).toContain("# OE-3: Global search");
  const t = await (await page.request.get("/api/v1/tickets/OE-3", { headers: auth })).json();
  expect(t.blockers.map((b: { key: string }) => b.key)).toEqual(["OE-2"]);
});

test("write API: create, move, block and archive tickets over HTTP", async () => {
  const headers = { authorization: `Bearer ${E2E.apiToken}` };
  const created = await page.request.post("/api/v1/tickets", {
    headers,
    data: { project: "OE", title: "API-made ticket", status: "Todo", priority: "High", labels: ["api"], milestone: "MVP" },
  });
  expect(created.status()).toBe(200);
  const t = await created.json();
  expect([t.key, t.status.name, t.priority.name, t.milestoneName]).toEqual(["OE-4", "Todo", "High", "MVP"]);
  const moved = await (await page.request.patch(`/api/v1/tickets/${t.key}`, { headers, data: { status: "in_progress" } })).json();
  expect(moved.status.name).toBe("In Progress");
  const blocked = await (await page.request.post(`/api/v1/tickets/${t.key}/blockers`, { headers, data: { blockedBy: "OE-1" } })).json();
  expect(blocked.blockers.map((b: { key: string }) => b.key)).toEqual(["OE-1"]);
  const bad = await page.request.patch(`/api/v1/tickets/${t.key}`, { headers, data: { status: "Shipped" } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toMatch(/Unknown status/);
  await page.goto(`/tickets/${t.key}`);
  await expect(page.locator("li", { hasText: "Todo → In Progress" }).filter({ hasText: "api ·" })).toBeVisible();
  const archived = await (await page.request.patch(`/api/v1/tickets/${t.key}`, { headers, data: { archived: true } })).json();
  expect(archived.archivedAt).toBeTruthy();
});

test("10. review progress and decide what to work on next", async () => {
  await page.goto("/");
  await expect(page.getByText("Suggested next")).toBeVisible();
  await expect(page.getByText(/Why: .*(priority|progress|review)/i).first()).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /OE Orbit E2E/ })).toBeVisible();
  await page.goto("/insights");
  await expect(page.getByText("Blocking bottlenecks")).toBeVisible();
  await expect(page.getByRole("link", { name: /OE-2/ }).first()).toBeVisible();

  await page.goto("/tickets/OE-1");
  await page.getByRole("button", { name: "Implementation brief" }).click();
  await expect(page.getByRole("dialog").getByText("# OE-1: Build the board")).toBeVisible();
});

test("search, palette and bulk edit", async () => {
  await page.goto("/tickets");
  await page.keyboard.press("Meta+k");
  await page.getByPlaceholder(/Search tickets, projects/).fill("Global");
  await expect(page.getByRole("option", { name: /OE-3 Global search/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByLabel("Select all").check();
  await page.locator("select").filter({ hasText: "Set priority…" }).selectOption({ label: "Low" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Updated 3 ticket/)).toBeVisible();
});

test("boards: one per project, created from the gallery", async () => {
  await page.goto("/board?project=OE");
  await expect(page).toHaveURL(/\/board\/OE$/);
  await page.goto("/board");
  await page.getByRole("button", { name: "Create new board" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Life Admin");
  await dialog.getByLabel("Key").fill("LIFE");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/board\/LIFE$/);
  await expect(page.getByRole("heading", { name: /Life Admin/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Boards" }).getByRole("link", { name: "OE" }).click();
  await expect(page).toHaveURL(/\/board\/OE$/);
  await expect(page.locator("a", { hasText: "Wire the API" })).toBeVisible();
  await expect(page.locator("a", { hasText: "Wire the API" })).toBeVisible();
  await page.goto("/board");
  await expect(page.getByRole("main").getByRole("link", { name: /All projects/ })).toHaveCount(0);
});

test("board: a card dropped mid-way down an empty column lands there", async () => {
  // A full Todo beside empty columns: the empty columns stretch to the board's height, so the old
  // corner-distance collision sent drops to a nearby Todo card instead.
  const headers = { authorization: `Bearer ${E2E.apiToken}` };
  for (let i = 1; i <= 10; i++)
    await page.request.post("/api/v1/tickets", { headers, data: { project: "LIFE", title: `Errand ${i}`, status: "todo" } });
  await page.goto("/board/LIFE");
  const card = page.locator("a", { hasText: "Errand 1" }).first();
  const column = (name: string) => page.locator("div.w-72", { has: page.getByText(name, { exact: true }) }).first();
  const from = (await card.boundingBox())!;
  const to = (await column("In Progress").boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(column("In Progress").locator("a", { hasText: "Errand 1" })).toBeVisible();
});

test("architecture: several diagram views pushed over the API, picked from a dropdown", async () => {
  const headers = { authorization: `Bearer ${E2E.apiToken}` };
  const flow = [
    "sequenceDiagram",
    "  autonumber",
    "  box rgb(240,248,255) Client side",
    "    actor U as User",
    "    participant W as Web",
    "  end",
    "  participant S as Service",
    "  U->>+W: generate ring",
    "  W->>+S: POST /rings",
    "  Note over W,S: validated with zod",
    "  alt valid",
    "    S-->>W: 200 ring",
    "  else invalid",
    "    S-->>W: 422 error",
    "  end",
    "  opt cache miss",
    "    S->>S: compute",
    "  end",
    "  deactivate S",
    "  W-->>-U: ring",
  ].join("\n");
  const views = [
    { id: "map", title: "Map: modules and services", mermaid: "flowchart LR\n  Web --> Service" },
    { id: "generate-ring", title: "Flow: generate a ring", mermaid: flow },
    { id: "broken", title: "Flow: broken", mermaid: "sequenceDiagram\n  A->>: oops" },
  ];
  const put = await page.request.put("/api/v1/projects/OE/diagram", { headers, data: { commit: "4bddebc", views } });
  expect(put.status()).toBe(200);
  const got = await (await page.request.get("/api/v1/projects/OE/diagram", { headers })).json();
  expect(got.views.map((v: { id: string }) => v.id)).toEqual(["map", "generate-ring", "broken"]);
  const bad = await page.request.put("/api/v1/projects/OE/diagram", { headers, data: { views: [{ id: "Bad Id", title: "x", mermaid: "x" }] } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toMatch(/view 1 \("Bad Id"\)/);

  await page.goto("/projects/OE?tab=architecture");
  await expect(page.getByText(/Drawn from 4bddebc/)).toBeVisible();
  const picker = page.getByLabel("Diagram");
  await expect(picker).toHaveValue("map");
  await expect(picker.locator("option")).toHaveText(["Map: modules and services", "Flow: generate a ring", "Flow: broken"]);
  await expect(page.locator("main svg").first()).toBeVisible();

  await picker.selectOption({ label: "Flow: generate a ring" });
  await expect(page).toHaveURL(/view=generate-ring/);
  const svg = page.locator("main svg[aria-roledescription=sequence]");
  await expect(svg).toBeVisible();
  await expect(svg.locator(".sequenceNumber")).toHaveCount(6); // autonumber: one per message
  await expect(svg.getByText("alt", { exact: true })).toBeVisible();
  await expect(svg.getByText("Client side")).toBeVisible(); // box
  await expect(svg.locator(".messageLine1")).not.toHaveCount(0); // dashed returns
  await expect(svg.locator(".activation0")).not.toHaveCount(0);
  await page.locator("main").screenshot({ path: "test-results/architecture-flow.png" });

  await picker.selectOption({ label: "Flow: broken" });
  await expect(page.getByText(/Mermaid syntax error/)).toBeVisible();
});
