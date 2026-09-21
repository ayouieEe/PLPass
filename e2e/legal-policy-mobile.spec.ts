import { expect, test } from "@playwright/test";

test.describe("legal policy mobile scrolling", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  for (const path of ["/terms", "/privacy"]) {
    test(`${path} uses one scroll container without bottom page space`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { name: path === "/terms" ? "Terms of Use" : "Privacy Policy" })).toBeVisible();

      const metrics = await page.evaluate(() => {
        const main = document.querySelector("main.plpass-auth-scene") as HTMLElement | null;
        const scrollableElements = [...document.querySelectorAll<HTMLElement>("*")]
          .filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY))
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight
          }));
        const footer = document.querySelector("footer")?.getBoundingClientRect();

        return {
          mainOverflowY: main ? getComputedStyle(main).overflowY : "missing",
          mainClientHeight: main?.clientHeight ?? 0,
          scrollableElements,
          footerBottom: footer?.bottom ?? Number.POSITIVE_INFINITY
        };
      });

      expect(metrics.mainOverflowY).toBe("hidden");
      expect(metrics.scrollableElements).toHaveLength(1);
      expect(metrics.scrollableElements[0].scrollHeight).toBeGreaterThan(metrics.scrollableElements[0].clientHeight);
      expect(metrics.footerBottom).toBeLessThanOrEqual(800);
    });
  }
});
