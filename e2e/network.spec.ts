import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// The promise of the README's Privacy section, held by tests: the names stay in the page. Nothing is asked of another
// host, and the page's Content-Security-Policy (written by vite.config.ts) has the browser refuse it.

const NAMES = ["A01_s1.tif", "A02_s1.tif", "B01_s2.tif", "B02_s2.tif"];
const ELSEWHERE = "https://elsewhere.example/";

type Scope = typeof globalThis & { refused: string[] };

// Keeps what the policy refuses, where it is told: a refusal in the page is told to the document, one in the Python
// worker to the worker. The worker's listener is added as the worker starts, before Python is fetched. Returns how
// to read both lists, the page's first. WebKit tells a worker nothing: its second list is always empty (the second
// test shows which browsers do tell).
async function watchRefusals(page: Page): Promise<() => Promise<string[][]>> {
  const listen = () => {
    const refused: string[] = ((globalThis as Scope).refused = []);
    globalThis.addEventListener("securitypolicyviolation", (e) => refused.push(`${e.effectiveDirective} ${e.blockedURI}`));
  };
  const read = () => (globalThis as Scope).refused;
  await page.addInitScript(listen);
  const listening = page.waitForEvent("worker").then(async (worker) => {
    await worker.evaluate(listen);
    return worker;
  });
  return async () => [await page.evaluate(read), await (await listening).evaluate(read)];
}

// The names are given and Python has answered: its worker is there and ready.
async function giveNames(page: Page) {
  await page.getByLabel("Choose image files").setInputFiles(NAMES.map((name) => ({ name, mimeType: "image/tiff", buffer: Buffer.from("not read") })));
  await expect(page.getByTestId("matched")).toHaveText("Matched 4 of 4 names");
}

test("a whole session asks nothing of another host", async ({ page, context, baseURL }) => {
  const site = new URL(baseURL!).origin + "/";
  const asked: string[] = [];
  context.on("request", (request) => asked.push(request.url()));
  const refusals = await watchRefusals(page);

  await page.goto("./");
  await giveNames(page);
  await page.getByRole("button", { name: "Remove Site" }).click();
  await expect(page.getByTestId("pattern")).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s\d+`);
  await page.getByRole("button", { name: "Copy this pattern" }).click();
  await page.getByRole("switch", { name: "Dark theme" }).click();

  expect(asked.some((url) => url.includes("/pyodide/") && url.endsWith("/pyodide.asm.wasm"))).toBe(true); // the worker's requests are seen too
  expect(asked.filter((url) => !url.startsWith(site) && !url.startsWith(`blob:${site}`))).toEqual([]); // the blob is the worker's first line
  expect(await refusals()).toEqual([[], []]); // and the policy is not in the way of the page or of Python
  // One worker, started from a blob. The policy cannot refuse a worker started from a file of the site (it has to let
  // Python's own script through), and such a worker would not be held to the policy: this line is what refuses it.
  expect(page.workers().map((worker) => worker.url().slice(0, 5))).toEqual(["blob:"]);
});

// A request to another host, made from inside the page or the worker. The route answers it, so "refused" can only
// come from the browser's own policy.
const ask = (url: string) =>
  fetch(url).then(
    () => "sent",
    () => "refused",
  );

test("the browser refuses a request to another host, from the page and from the Python worker", async ({ page, context, browserName }) => {
  await context.route(`${ELSEWHERE}**`, (route) => route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: "" }));
  const refusals = await watchRefusals(page);
  await page.goto("./");
  await giveNames(page);

  expect(await page.evaluate(ask, ELSEWHERE)).toBe("refused");
  expect(page.workers()).toHaveLength(1);
  expect(await page.workers()[0].evaluate(ask, ELSEWHERE)).toBe("refused");

  // Each refusal was told where the first test listens, so an empty list there does mean that nothing was refused.
  // Not for the worker in WebKit, which refuses the request and does not tell.
  const told = expect.stringContaining(`connect-src ${new URL(ELSEWHERE).origin}`);
  expect(await refusals()).toEqual([[told], browserName === "webkit" ? [] : [told]]);
});

