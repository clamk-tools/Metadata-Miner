import { expect, test } from "./fixtures";

const NAMES = "A01_s1.tif\nA02_s1.tif\nB01_s2.tif\nB02_s2.tif";

// Python is about 6 MB, fetched after the page. A connection that drops meanwhile must get an explanation and a way to
// try again, not a spinner.
test("when Python cannot be downloaded the page says so, and Try again recovers", async ({ page, context, pageErrors }) => {
  await context.route("**/pyodide/**", (route) => route.abort());
  await page.goto("./");

  await expect(page.getByTestId("engine")).toContainText("Python could not be loaded"); // said on the names step already

  await page.getByLabel("Or paste the names").fill(NAMES); // names are taken all the same
  await page.getByRole("button", { name: "Use these names" }).click();
  await expect(page.getByRole("heading", { name: "Python could not be loaded" })).toBeVisible();

  await context.unroute("**/pyodide/**");
  // Pyodide's loader leaves some of its failed downloads unhandled. They are this test's doing: from here on, any
  // error fails the test again.
  pageErrors.length = 0;
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByTestId("matched")).toHaveText("Matched 4 of 4 names");
});

// A browser too old for the word that allows WebAssembly in the page's policy refuses to run Python, every time. No
// such browser is at hand: the word is taken out of the policy instead, which leaves a current browser refusing too.
test("when the browser refuses to run Python the page says so, and does not offer to try again", async ({ page, context }) => {
  let pyodideAsked = false;
  await context.route("**/pyodide/**", (route) => {
    pyodideAsked = true;
    return route.continue();
  });
  await context.route(
    (url) => url.pathname.endsWith("/"),
    async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      const word = / (&#39;|')wasm-unsafe-eval(&#39;|')/; // the built page writes the quotes as entities
      expect(html).toMatch(word);
      await route.fulfill({ response, body: html.replace(word, "") });
    },
  );
  await page.goto("./");

  await expect(page.getByTestId("engine")).toContainText("This browser cannot run Python");
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  await page.getByLabel("Or paste the names").fill(NAMES);
  await page.getByRole("button", { name: "Use these names" }).click();
  await expect(page.getByRole("heading", { name: "This browser cannot run Python" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to the names" })).toBeVisible();

  expect(pyodideAsked).toBe(false); // found out before the download, not after it
});
