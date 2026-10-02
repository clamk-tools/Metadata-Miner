import { expect, test as base } from "@playwright/test";

// What every end-to-end test starts from: `test` fails on an error the page did not handle (`pageerror`), in each
// spec file, without the file asking for it.
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, run) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await run(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
