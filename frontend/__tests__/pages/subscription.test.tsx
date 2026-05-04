import { describe, it, expect } from "vitest";
import { isStripeCheckoutUrl } from "@/lib/api";

describe("isStripeCheckoutUrl", () => {
  it("accepts a real Stripe checkout URL over https", () => {
    expect(
      isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_abc"),
    ).toBe(true);
  });

  it("rejects http (must be https)", () => {
    expect(
      isStripeCheckoutUrl("http://checkout.stripe.com/c/pay/cs_test_abc"),
    ).toBe(false);
  });

  it("rejects look-alike subdomain", () => {
    expect(
      isStripeCheckoutUrl("https://checkout.stripe.com.evil.example/x"),
    ).toBe(false);
  });

  it("rejects open-redirect attacker host", () => {
    expect(isStripeCheckoutUrl("https://evil.example/checkout")).toBe(false);
  });

  it("rejects javascript: scheme", () => {
    expect(isStripeCheckoutUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty / non-string input", () => {
    expect(isStripeCheckoutUrl("")).toBe(false);
    expect(isStripeCheckoutUrl(null)).toBe(false);
    expect(isStripeCheckoutUrl(undefined)).toBe(false);
    expect(isStripeCheckoutUrl(123)).toBe(false);
  });

  it("rejects malformed URL", () => {
    expect(isStripeCheckoutUrl("not-a-url")).toBe(false);
  });
});
