import { expect, test } from "@playwright/test";

test.describe("legal policy mobile scrolling", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  for (const path of ["/terms", "/privacy"]) {
    test(`${path} scrolls the document without bottom page space`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { name: path === "/terms" ? "Terms of Use" : "Privacy Policy" })).toBeVisible();

      const metrics = await page.evaluate(() => {
        const main = document.querySelector("main.plpass-auth-scene") as HTMLElement | null;
        const policyBody = document.querySelector(".plpass-auth-content > div") as HTMLElement | null;

        return {
          mainOverflowY: main ? getComputedStyle(main).overflowY : "missing",
          policyOverflowY: policyBody ? getComputedStyle(policyBody).overflowY : "missing",
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight
        };
      });

      expect(metrics.mainOverflowY).toBe("auto");
      expect(metrics.policyOverflowY).toBe("visible");
      expect(metrics.documentHeight).toBeGreaterThan(metrics.viewportHeight);

      const bottom = await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo(0, document.documentElement.scrollHeight);
        return {
          scrollY: window.scrollY,
          remaining: document.documentElement.scrollHeight - window.scrollY - window.innerHeight,
          footerBottom: document.querySelector("footer")?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY
        };
      });
      expect(bottom.scrollY).toBeGreaterThan(0);
      expect(bottom.remaining).toBeLessThanOrEqual(1);
      expect(bottom.footerBottom).toBeLessThanOrEqual(metrics.viewportHeight);
    });
  }
});
