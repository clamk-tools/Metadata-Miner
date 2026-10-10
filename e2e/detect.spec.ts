import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures"; // every test fails on an error the page did not handle

const FOUR = ["A01_s1.tif", "A02_s1.tif", "B01_s2.tif", "B02_s2.tif"];

// The plate of the Python tests (py/tests/test_metadata_detect.py): 2 plates x 24 wells x 3 sites x 3 channels, plus
// three names that do not follow the layout. Its pattern is the string those tests assert, so the page (Pyodide) and the
// Python tests (CPython) are held to one answer.
const PLATE_PATTERN = String.raw`(?P<Plate>plate\d+)_(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)_w\d+_(?P<Channel>[A-Za-z0-9]+)`;

const PLATE_NAMES: string[] = [];
for (const plate of [1, 2])
  for (const row of "ABCD")
    for (let col = 1; col <= 6; col++)
      for (const site of [1, 2, 3])
        for (const [w, dye] of [["1", "DAPI"], ["2", "GFP"], ["3", "Cy5"]])
          PLATE_NAMES.push(`plate${plate}_${row}${String(col).padStart(2, "0")}_s${site}_w${w}_${dye}.tif`);
PLATE_NAMES.push("plate1_B3_s2_w1_DAPI.tif", "plate1_C7_s10_w1_DAPI.tif", "plate1_ctrl_s1_w2_GFP.tif");

// Names where a value is two words in some of them ("Far Red", "Texas Red"), so those names have one part more.
const DYES = [
  "B - 2( wv Blue - FITC).tif",
  "B - 3( wv Green - DAPI).tif",
  "B - 4( wv Red - TRITC).tif",
  "A - 1( wv Blue - FITC).tif",
  "A - 2( wv Green - DAPI).tif",
  "C - 5( wv Red - Cy3).tif",
  "D - 6( wv Far Red - Cy5).tif",
  "B - 2( wv Blue - DAPI).tif",
  "B - 2( wv Green - FITC).tif",
  "B - 2( wv Red - TRITC).tif",
  "C - 7( wv Blue - Hoechst).tif",
  "C - 8( wv Green - GFP).tif",
  "D - 1( wv Red - RFP).tif",
  "D - 2( wv Far Red - Cy5).tif",
  "E - 3( wv Blue - DAPI).tif",
  "E - 4( wv Green - FITC).tif",
  "F - 5( wv Red - Texas Red).tif",
  "F - 6( wv Far Red - Cy5).tif",
  "G - 7( wv Blue - Hoechst).tif",
  "H - 8( wv Green - FITC).tif",
  "A - 10( wv Blue - DAPI).tif",
  "B - 11( wv Green - GFP).tif",
  "C - 12( wv Red - RFP).tif",
  "D - 13( wv Far Red - Cy5).tif",
];
const WORDS = "[A-Za-z0-9]+(?: [A-Za-z0-9]+)*";

const pattern = (page: Page) => page.getByTestId("pattern");
const matched = (page: Page) => page.getByTestId("matched");

test.beforeEach(async ({ page }) => {
  await page.goto("./");
});

async function paste(page: Page, names: string[]) {
  await page.getByLabel("Paste the names").fill(names.join("\n"));
  await page.getByRole("button", { name: "Use these names" }).click();
}

test("the page opens on the names step, with nothing else to get through", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "ez.Regex" })).toBeVisible();
  await expect(page.getByText("File name in, regex out")).toBeVisible();
  await expect(page.getByLabel("Paste the names, one per line")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose files…" })).toHaveCount(0); // pasting is the only way in
  await expect(page.getByRole("button", { name: "Use these names" })).toBeDisabled(); // until some names are pasted
  await expect(page.getByText("No file is opened, and nothing is uploaded.")).toHaveCount(0); // the line under the paste box is gone
  await expect(page.getByRole("heading", { name: "Detect the pattern" })).toHaveCount(0);
});

test("a plate of names gets the pattern Python gives, and Copy puts it on the clipboard", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await paste(page, PLATE_NAMES);

  await expect(pattern(page)).toHaveText(PLATE_PATTERN);
  await expect(matched(page)).toHaveText("Matched 432 of 435 names");
  await expect(page.getByText("1 of 435")).toBeVisible();

  await page.getByRole("button", { name: "Copy this pattern" }).click();
  if (browserName === "chromium") {
    await expect(page.getByText("Copied to the clipboard")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PLATE_PATTERN);
  } else {
    // a browser may refuse the clipboard: the pattern is then selected for Ctrl+C
    await expect(page.getByText(/Copied to the clipboard|press Ctrl\+C/)).toBeVisible();
  }
});

test("pasted names are labeled by hand: pick a part, click the name, choose what each is", async ({ page }) => {
  await paste(page, FOUR.map((name) => `C:\\screens\\plate 1\\${name}`)); // full paths: the file name is kept (privacy-ok: invented paths)

  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`); // what Detect proposes
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(pattern(page)).toHaveText("No pattern yet.");

  await page.getByLabel("Pick a part").getByRole("button", { name: "A01" }).click();
  await page.getByRole("button", { name: "Well", exact: true }).click();
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s\d+`);

  await page.locator('[data-i="4"]').click(); // the "s" of s1: a click takes the letters and digits around it
  await expect(page.getByText("Label s1 as")).toBeVisible();
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`);
  await expect(matched(page)).toHaveText("Matched 4 of 4 names");
  await expect(page.getByRole("row", { name: "A01_s1.tif A01 1" })).toBeVisible();
});

test("a drag across the name selects whole groups, and Escape drops the selection", async ({ page }) => {
  await paste(page, FOUR);
  await expect(matched(page)).toHaveText("Matched 4 of 4 names");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(pattern(page)).toHaveText("No pattern yet.");

  const from = await page.locator('[data-i="1"]').boundingBox(); // the "0" of A01
  const to = await page.locator('[data-i="4"]').boundingBox(); // the "s" of s1
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByText("Label 01_s as")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Select a part of the name to label it")).toBeVisible();
});

test("an unmatched name becomes the sample and widens the pattern", async ({ page }) => {
  await paste(page, PLATE_NAMES);
  await expect(matched(page)).toHaveText("Matched 432 of 435 names");

  await page.getByRole("button", { name: "plate1_B3_s2_w1_DAPI.tif" }).click();

  await expect(matched(page)).toHaveText("Matched 434 of 435 names");
  await expect(page.getByText(String.raw`Well now reads [A-Z]\d+, which fits B3 and A01.`)).toBeVisible();
});

test("a field can be renamed and its style changed, and a bad name is refused with Python's message", async ({ page }) => {
  await paste(page, FOUR);
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`);

  await page.getByLabel("Name of the field labeled A01").fill("Position");
  await page.getByLabel("Name of the field labeled A01").press("Enter");
  await expect(pattern(page)).toHaveText(String.raw`(?P<Position>[A-Z]\d{2})_s(?P<Site>\d+)`);

  await page.getByLabel("Pattern style of Position").selectOption("flex");
  await expect(pattern(page)).toHaveText(String.raw`(?P<Position>[A-Z]+\d+)_s(?P<Site>\d+)`);

  await page.getByLabel("Name of the field labeled A01").fill("9lives");
  await page.getByLabel("Name of the field labeled A01").press("Enter");
  await expect(page.getByRole("alert")).toContainText("not a usable field name");
  await expect(pattern(page)).toHaveText(String.raw`(?P<Position>[A-Z]+\d+)_s(?P<Site>\d+)`);
});

test("the sample arrows move through the names and the options change the pattern", async ({ page }) => {
  await paste(page, FOUR);
  await expect(page.getByText("1 of 4")).toBeVisible();

  await page.getByRole("button", { name: "Next name" }).click();
  await expect(page.getByText("2 of 4")).toBeVisible();
  await expect(page.getByLabel("Pick a part").getByRole("button", { name: "A02" })).toBeVisible();

  await page.getByRole("button", { name: "Remove Site" }).click(); // one label left: the anchor is what keeps "_s1" beside it
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s\d+`);
  await page.getByLabel("Anchor with the neighbouring part on each side").uncheck();
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})`);

  await page.getByRole("button", { name: "Suggest again" }).click();
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`);
});

test("names that are not images are refused, with the reason", async ({ page }) => {
  await paste(page, ["a_1.nd2", "b_2.nd2"]);

  await expect(page.getByRole("alert")).toContainText("None of the 2 names is an image");
  await expect(page.getByRole("alert")).toContainText("a_1.nd2, b_2.nd2");
});

test("other files are ignored and counted, and the cross goes back to the names", async ({ page }) => {
  await paste(page, [...FOUR, "notes.txt", "Thumbs.db", "A01_s1.tif"]);

  await expect(page.getByText("1 of 4")).toBeVisible(); // the repeated name is kept once
  await expect(page.getByTestId("ignored")).toContainText("2 other names ignored");

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByLabel("Paste the names")).toHaveValue(/notes\.txt/); // what was pasted is still there
});

test("a single name says why nothing is proposed", async ({ page }) => {
  await paste(page, ["AS_09125_050118150001_A03f01d0.tif"]);

  await expect(page.getByText("One name only")).toBeVisible();
  await expect(page.getByText("Nothing varies across these names, so there is nothing to suggest.")).toBeVisible();
  await expect(pattern(page)).toHaveText("No pattern yet.");
  await expect(page.getByRole("button", { name: "Copy this pattern" })).toBeDisabled();
});

test("a file dropped on the page is ignored: the tool stays open on the names step", async ({ page }) => {
  const kept = await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["not read"], "A01_s1.tif"));
    const drop = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
    window.dispatchEvent(drop);
    return drop.defaultPrevented; // not prevented: the browser would open the file in place of the page
  });

  expect(kept).toBe(true);
  await expect(page.getByLabel("Paste the names, one per line")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detect the pattern" })).toHaveCount(0);
});

const DARK = "rgb(21, 24, 26)";
const LIGHT = "rgb(251, 252, 252)";

test("the theme follows the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", DARK);
  await expect(page.getByRole("switch", { name: "Dark theme" })).toBeChecked();

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT);
  await expect(page.getByRole("switch", { name: "Dark theme" })).not.toBeChecked();
});

test("the switch picks a theme, which is kept under the key the Clamk tools share", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("switch", { name: "Dark theme" }).click();
  await expect(page.locator("body")).toHaveCSS("background-color", DARK);
  expect(await page.evaluate(() => localStorage.getItem("clamk-tools:theme"))).toBe("dark");

  await page.reload(); // the choice holds, whatever the system says
  await expect(page.locator("body")).toHaveCSS("background-color", DARK);
  await expect(page.getByRole("switch", { name: "Dark theme" })).toBeChecked();

  await page.getByRole("switch", { name: "Dark theme" }).click();
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT);
});

test("the name in the header goes back to the names", async ({ page }) => {
  await paste(page, FOUR);
  await expect(page.getByRole("heading", { name: "Detect the pattern" })).toBeVisible();

  await page.getByRole("link", { name: "ez.Regex" }).click();
  await expect(page.getByLabel("Paste the names")).toHaveValue(/A01_s1\.tif/);
});

test("the header links back to all the Clamk tools", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("banner").getByRole("link", { name: "← All tools" })).toHaveAttribute("href", "https://clamk-tools.github.io/");
});

test("a label already in use can be chosen for another part: it moves there", async ({ page }) => {
  await paste(page, FOUR);
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`); // Well is on A01, Site on s1

  await page.getByLabel("Pick a part").getByRole("button", { name: "s1" }).click();
  await expect(page.getByRole("button", { name: "Well", exact: true })).toHaveAttribute("title", "Move the Well label here");
  await page.getByRole("button", { name: "Well", exact: true }).click(); // in use on A01, and still a choice

  await expect(pattern(page)).toHaveText(String.raw`[A-Z]+\d+_(?P<Well>[a-z]\d+)`); // Well is now on s1, and nowhere else
  await expect(page.getByLabel("Name of the field labeled s1")).toHaveValue("Well");
  await expect(page.getByLabel("Name of the field labeled A01")).toHaveCount(0);
});

test("the two options explain themselves with an example, and the label hint line is gone", async ({ page }) => {
  await paste(page, PLATE_NAMES);
  await page.getByLabel("Pick a part").getByRole("button", { name: "A01" }).click();
  await expect(page.getByText(/Already used/)).toHaveCount(0);

  await page.getByRole("button", { name: "What anchoring does" }).focus();
  await expect(page.getByRole("tooltip").filter({ hasText: "Adds the text just before and just after your labels" })).toBeVisible();
  await expect(page.getByRole("tooltip").filter({ hasText: "reads plate1: wrong place" })).toBeVisible();

  await page.getByRole("button", { name: "What letting the numbers vary does" }).focus();
  await expect(page.getByRole("tooltip").filter({ hasText: "matches 72 names: plate 1, site 2 only" })).toBeVisible();
});

test("an i bubble is not cut off when nothing is labeled", async ({ page }) => {
  await paste(page, ["AS_09125_050118150001_A03f01d0.tif"]); // one name: no pattern, so nothing under the options
  await expect(pattern(page)).toHaveText("No pattern yet.");

  await page.getByRole("button", { name: "What letting the numbers vary does" }).focus();
  const bubble = page.getByRole("tooltip").filter({ hasText: "matches 72 names: plate 1, site 2 only" });
  await expect(bubble).toBeVisible();

  // the bubble runs past the bottom of the Detect section, which therefore must not clip what is under its edge
  const bottom = async (of: Locator) => (await of.evaluate((el) => el.getBoundingClientRect().bottom)) as number;
  expect(await bottom(bubble)).toBeGreaterThan(await bottom(page.locator(".dt")));
  await expect(page.locator(".dt")).toHaveCSS("overflow-y", "visible");
});

test("the Pattern title has an i that lists what the symbols mean", async ({ page }) => {
  await paste(page, FOUR);
  await page.getByRole("button", { name: "Reading the pattern: what each symbol means" }).focus();

  const guide = page.getByRole("tooltip").filter({ hasText: "Reading the pattern" });
  await expect(guide).toBeVisible();
  for (const text of ["Named group", "One digit.", "One or more", "Zero or more", "a or b", "A backslash turns a symbol into plain text.", "Python syntax"])
    await expect(guide).toContainText(text);
});

test("unticking and re-ticking an option gives the same pattern, labels and values back", async ({ page }) => {
  await paste(page, PLATE_NAMES);
  await expect(pattern(page)).toHaveText(PLATE_PATTERN);

  const anchor = page.getByLabel("Anchor with the neighbouring part on each side");
  const numbers = page.getByLabel("Allow fixed text to vary in its numbers");
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByLabel("Pick a part").getByRole("button", { name: "DAPI" }).click();
  await page.getByRole("button", { name: "Channel", exact: true }).click();
  const anchored = String.raw`w\d+_(?P<Channel>[A-Za-z0-9]+)`;
  await expect(pattern(page)).toHaveText(anchored);

  await anchor.uncheck();
  await expect(pattern(page)).toHaveText(String.raw`(?P<Channel>[A-Za-z0-9]+)`); // reads plate1: that is what unanchored means
  await anchor.check();
  await expect(pattern(page)).toHaveText(anchored);
  await expect(page.getByRole("row", { name: "plate1_A01_s1_w1_DAPI.tif DAPI" })).toBeVisible();

  await numbers.uncheck();
  await expect(pattern(page)).toHaveText(String.raw`w1_(?P<Channel>[A-Za-z0-9]+)`);
  await numbers.check();
  await expect(pattern(page)).toHaveText(anchored);
  await expect(page.getByText("Labels · 1")).toBeVisible();
});

test("a value that is two words in some names is read, and the odd name left widens the pattern when clicked", async ({ page }) => {
  await paste(page, DYES);

  // Far Red is in 4 names of 24: the proposed Channel reads several words, and every name matches
  await expect(page.getByTestId("matched")).toHaveText("Matched 24 of 24 names");
  await expect(page.getByLabel("Pattern style of Channel")).toContainText("Auto (several words) · 24/24");

  // Texas Red is in one name: labeled as "any word", the filter leaves that name out
  await page.getByLabel("Pick a part").getByRole("button", { name: "FITC" }).click();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByTestId("matched")).toHaveText("Matched 23 of 24 names");

  await page.getByRole("button", { name: "F - 5( wv Red - Texas Red).tif" }).click();

  await expect(page.getByTestId("matched")).toHaveText("Matched 24 of 24 names");
  await expect(page.getByText("Widened Filter to “several words” so it fits both FITC and Texas Red.")).toBeVisible();
  await expect(page.getByTestId("pattern")).toHaveText(String.raw`(?P<Row>[A-Z]) - (?P<Column>\d+)\( wv (?P<Channel>${WORDS}) - (?P<Filter>${WORDS})\)`);
  await expect(page.getByText("4 distinct · Blue, Far Red, Green, Red · text")).toBeVisible(); // what Channel reads
});

test("the keyboard focus stays on the control that was used while Python answers", async ({ page }) => {
  await paste(page, FOUR);
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`);

  const again = page.getByRole("button", { name: "Suggest again" });
  await again.focus();
  await page.keyboard.press("Enter");
  await expect(again).toBeEnabled();
  await expect(again).toBeFocused();

  const anchor = page.getByLabel("Anchor with the neighbouring part on each side");
  await anchor.focus();
  await page.keyboard.press("Space");
  await expect(anchor).not.toBeChecked();
  await expect(anchor).toBeFocused();

  const style = page.getByLabel("Pattern style of Well");
  await style.focus(); // selectOption alone does not put the focus on it
  await style.selectOption("flex");
  await expect(pattern(page)).toContainText(String.raw`(?P<Well>[A-Z]+\d+)`);
  await expect(style).toBeFocused();

  // a rename gives a new card: the focus goes to its name box
  const name = page.getByLabel("Name of the field labeled A01");
  await name.fill("Position");
  await name.press("Enter");
  await expect(pattern(page)).toContainText("(?P<Position>");
  await expect(name).toBeFocused();

  // a removed label's control is gone: the focus goes to the control now in its place, not to the top of the page
  await page.getByRole("button", { name: "Remove Position" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Labels · 1")).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".dt"))).toBe(true);
});

test("a quick answer does not dim the screen", async ({ page }) => {
  await paste(page, FOUR);
  await expect(pattern(page)).toHaveText(String.raw`(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)`);

  // The moment Python is asked, every control is disabled; it is not drawn dimmed before 400 ms.
  await page.evaluate(() => {
    const copy = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Copy this pattern"))!;
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    new MutationObserver(() => {
      if (copy.disabled) seen.push(getComputedStyle(copy).opacity);
    }).observe(copy, { attributes: true, attributeFilter: ["disabled"] });
  });
  await page.getByRole("button", { name: "Suggest again" }).click();
  await expect(page.getByRole("button", { name: "Copy this pattern" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["1"]);
  await expect(page.getByRole("button", { name: "Copy this pattern" })).toBeEnabled();
});

test("a pattern that would read the sample in the wrong place is tied to the start of the name", async ({ page }) => {
  await paste(page, ["s1_s2_s3.tif", "s3_x2_w2.tif", "x2_s1_w1.tif"]); // the text before the last 3 looks like it
  await expect(matched(page)).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();

  await page.locator('[data-i="7"]').click(); // the 3 of s3
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await expect(pattern(page)).toHaveText(String.raw`^[a-z]+\d+_[a-z]+\d+_s(?P<Site>\d+)`);
  await expect(page.getByRole("row", { name: "s1_s2_s3.tif 3" })).toBeVisible();

  // unanchored, the pattern is left as asked, and the page says what it reads
  await page.getByLabel("Anchor with the neighbouring part on each side").uncheck();
  await expect(page.getByText("In this name the pattern reads Site as 1, not 3")).toBeVisible();
});
