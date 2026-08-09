import { expect, test } from "@playwright/test";
import { parseRequest } from "../../api/brochure";

const MOCK_BROCHURE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("accepts brochure requests from tabs opened before generation IDs shipped", () => {
  const request = parseRequest({
    clientId: "legacy-client-123",
    dimensions: {
      height: 749.3,
      length: 1905,
      topThickness: 31.75,
      width: 901.7,
    },
    images: Array.from({ length: 4 }, () => MOCK_BROCHURE_IMAGE),
    modelId: "hover-dining-table",
    modelName: "X-Hover Dining Table",
  });

  expect(request?.generationId).toMatch(/^[a-zA-Z0-9-]{20,64}$/);
});

test("brochure mode captures four CAD angles and presents the generated image", async ({
  page,
}) => {
  test.setTimeout(60_000);
  let requestPayload: {
    clientId: string;
    dimensions: Record<string, number>;
    generationId: string;
    images: string[];
    modelId: string;
    modelName: string;
  } | null = null;
  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  await page.route("**/api/brochure", async (route) => {
    requestPayload = route.request().postDataJSON();
    await responseGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generationId: requestPayload!.generationId,
        imageDataUrl: MOCK_BROCHURE_IMAGE,
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  await page.goto("/?model=hover-dining-table&unit=in");
  const viewer = page.locator(".viewer");
  const canvas = page.locator(".scene-panel canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Center view" }).click();
  const orientationBefore = await page
    .locator(".orientation-cube")
    .getAttribute("style");

  await page.getByRole("button", { name: "Brochure", exact: true }).click();
  const brochure = page.getByTestId("hover-brochure-panel");
  await expect(viewer).toHaveAttribute("data-assembly-mode", "brochure");
  await expect(brochure).toHaveAttribute("data-status", "generating");
  await expect
    .poll(() => requestPayload, { message: "brochure request payload" })
    .not.toBeNull();

  expect(requestPayload!.modelId).toBe("hover-dining-table");
  expect(requestPayload!.modelName).toBe("X-Hover Dining Table");
  expect(requestPayload!.clientId).toMatch(/^[a-zA-Z0-9-]{8,64}$/);
  expect(requestPayload!.generationId).toMatch(/^[a-zA-Z0-9-]{20,64}$/);
  expect(requestPayload!.images).toHaveLength(4);
  expect(
    requestPayload!.images.every((image) =>
      image.startsWith("data:image/jpeg;base64,"),
    ),
  ).toBe(true);
  expect(requestPayload!.images.every((image) => image.length > 1_000)).toBe(
    true,
  );
  expect(requestPayload!.dimensions.length).toBeCloseTo(75 * 25.4, 0);
  expect(requestPayload!.dimensions.width).toBeCloseTo(35.5 * 25.4, 0);

  releaseResponse();
  await expect(brochure).toHaveAttribute("data-status", "success");
  await expect(
    page.getByAltText("X-Hover Dining Table in a generated brochure room scene"),
  ).toHaveAttribute("src", MOCK_BROCHURE_IMAGE);
  await expect(page.getByRole("link", { name: "Download PNG" })).toHaveAttribute(
    "download",
    "x-hover-dining-table-brochure.png",
  );
  await expect(
    page.getByText(/CAD model remains authoritative/),
  ).toBeVisible();
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to model" }).click();
  await expect(brochure).toHaveCount(0);
  await expect(viewer).toHaveAttribute("data-assembly-mode", "assembled");
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBefore!,
  );

  await page.getByRole("button", { name: "Brochures", exact: true }).click();
  await expect(
    page.getByText("Connect Convex to save and browse generated brochures."),
  ).toBeVisible();
});
